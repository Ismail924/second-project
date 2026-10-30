#!/usr/bin/env ruby
# Use existing Apple Developer API credentials and distribution certificate to
# create *new* temporary App Store provisioning profiles for RIVAYA+WidgetKit.
# Never delete or invalidate the profile used by the previous public build.
require 'base64'
require 'openssl'
require 'net/http'
require 'json'
require 'uri'
require 'plist'
require 'jwt'
require 'tmpdir'
key=OpenSSL::PKey::EC.new(Base64.strict_decode64(ENV.fetch('ASC_KEY_P8_BASE64').delete("\r\n")))
token=JWT.encode({iss:ENV.fetch('ASC_ISSUER_ID'),iat:Time.now.to_i-10,exp:Time.now.to_i+600,aud:'appstoreconnect-v1'},
 key,'ES256',{kid:ENV.fetch('ASC_KEY_ID'),typ:'JWT'})
def api(token,method,path,body=nil)
 uri=URI("https://api.appstoreconnect.apple.com#{path}")
 req=(method==:post ? Net::HTTP::Post : Net::HTTP::Get).new(uri)
 req['Authorization']="Bearer #{token}"
 req['Accept']='application/json'
 req['Content-Type']='application/json'
 req.body=JSON.generate(body) if body
 res=Net::HTTP.start(uri.host,uri.port,use_ssl:true,open_timeout:20,read_timeout:45){|http|http.request(req)}
 data=JSON.parse(res.body) rescue {}
 unless (200..299).cover?(res.code.to_i)
  msg=Array(data['errors']).map{|x|x['detail']||x['title']}.compact.join('; ')
  abort("Apple provisioning API failure #{method} #{uri.path}: HTTP #{res.code} #{msg[0,200]}")
 end
 data
end
ids={}
['app.rivaya.smart01','app.rivaya.smart01.widgets'].each do |identifier|
 filter=URI.encode_www_form([['filter[identifier]',identifier],['limit',10]])
 ids[identifier]=Array(api(token,:get,"/v1/bundleIds?#{filter}")['data']).find{|x|x.dig('attributes','identifier')==identifier}||abort("Bundle ID missing: #{identifier}")
end
# Match the Apple distribution certificate to the private key already stored in
# GitHub secrets. Do not rely on old provisioning profiles' relationship fields.
cert_p12=OpenSSL::PKCS12.new(
  Base64.strict_decode64(ENV.fetch('APPLE_CERTIFICATE_P12_BASE64').gsub(/\s/,'')),
  ENV.fetch('APPLE_CERTIFICATE_PASSWORD')
)
local_cert=cert_p12.certificate
abort('Distribution p12 does not contain a certificate') unless local_cert
local_der=local_cert.to_der
cert_response=api(token,:get,"/v1/certificates?limit=200")
certificates=Array(cert_response['data'])
matches=certificates.select do |item|
  attributes=item.fetch('attributes',{})
  next false unless attributes['certificateType'].to_s.include?('DISTRIBUTION')
  content=attributes['certificateContent'].to_s.gsub(/\s/,'')
  next false if content.empty?
  begin
    decoded=Base64.strict_decode64(content)
    decoded==local_der || OpenSSL::X509::Certificate.new(decoded).to_der==local_der
  rescue OpenSSL::X509::CertificateError,ArgumentError
    false
  end
end
abort('Cannot match existing Apple Distribution certificate in P12 to an active Apple Developer certificate; old profiles are not altered.') if matches.empty?
certificate_id=matches.first.fetch('id')
puts 'Confirmed distribution certificate matches installed private key.'

names=[['app.rivaya.smart01','APPLE_APP_GROUP_PROFILE_BASE64'],
       ['app.rivaya.smart01.widgets','APPLE_WIDGET_PROFILE_BASE64']]
profiles_for_build={}
names.each do |identifier,environment|
 bundle_id=ids.fetch(identifier).fetch('id')
 nonce=Time.now.utc.strftime('%Y%m%d%H%M%S')
 payload={data:{type:'profiles',attributes:{name:"RIVAYA 4.4 WidgetKit #{identifier} #{nonce}",profileType:'IOS_APP_STORE'},
 relationships:{bundleId:{data:{type:'bundleIds',id:bundle_id}},certificates:{data:[{type:'certificates',id:certificate_id}]}}}}
 profile=api(token,:post,'/v1/profiles',payload).fetch('data')
 encoded=profile.dig('attributes','profileContent')
 abort("Missing profile content for #{identifier}") unless encoded
 profiles_for_build[environment]=encoded
 # Validate exact signed entitlements of each new profile before any upload.
 Dir.mktmpdir('rivaya-profile-') do |dir|
  filename=File.join(dir,'new.mobileprovision')
  File.binwrite(filename,Base64.strict_decode64(encoded))
  xml=IO.popen(['security','cms','-D','-i',filename], &:read)
  abort("Invalid Apple provisioning profile #{identifier}") unless $?.success?
  parsed=Plist.parse_xml(xml)
  entitlements=parsed['Entitlements']||{}
  identifier_field=entitlements['application-identifier']
  groups=Array(entitlements['com.apple.security.application-groups'])
  unless identifier_field=="M2329MH9ZX.#{identifier}" && groups.include?('group.app.rivaya.smart01')
   abort("Apple profile for #{identifier} lacks group.app.rivaya.smart01; register the group in Apple Developer and assign it to both App IDs. TestFlight upload prevented.")
  end
  puts "Verified App Group entitlement and signing team for #{identifier}"
 end
end
File.open(ENV.fetch('GITHUB_ENV'),'a',0600) do |f|
 profiles_for_build.each do |name,encoded|
  f.puts("#{name}=#{encoded}")
 end
end
puts "Both new, verified App Store profiles are available for this workflow run only."
