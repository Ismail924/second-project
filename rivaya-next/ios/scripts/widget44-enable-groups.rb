#!/usr/bin/env ruby
# Enable only APP_GROUPS on the existing RIVAYA App ID and its registered WidgetKit App ID.
require 'openssl'
require 'base64'
require 'json'
require 'net/http'
require 'uri'
require 'jwt'
key=OpenSSL::PKey::EC.new(Base64.strict_decode64(ENV.fetch('ASC_KEY_P8_BASE64').delete("\r\n")))
token=JWT.encode({iss:ENV.fetch('ASC_ISSUER_ID'),iat:Time.now.to_i-10,exp:Time.now.to_i+300,aud:'appstoreconnect-v1'},key,'ES256',{kid:ENV.fetch('ASC_KEY_ID'),typ:'JWT'})
def request(token,method,path,body=nil)
 uri=URI("https://api.appstoreconnect.apple.com#{path}")
 req=(method==:post ? Net::HTTP::Post : Net::HTTP::Get).new(uri)
 req['Authorization']="Bearer #{token}"
 req['Content-Type']='application/json'
 req.body=JSON.generate(body) if body
 res=Net::HTTP.start(uri.host,uri.port,use_ssl:true,open_timeout:20,read_timeout:40){|http|http.request(req)}
 data=JSON.parse(res.body) rescue {}
 unless (200..299).cover?(res.code.to_i)
  msg=Array(data['errors']).map{|x|x['detail']||x['title']}.compact.join('; ')
  abort("App Groups capability permission denied: HTTP #{res.code} #{msg[0,250]}")
 end
 data
end
['app.rivaya.smart01','app.rivaya.smart01.widgets'].each do |identifier|
 filter=URI.encode_www_form([['filter[identifier]',identifier],['limit',10]])
 items=Array(request(token,:get,"/v1/bundleIds?#{filter}")['data'])
 app=items.find{|x|x.dig('attributes','identifier')==identifier}
 abort("Bundle ID not registered: #{identifier}") unless app
 id=app.fetch('id')
 caps=Array(request(token,:get,"/v1/bundleIds/#{id}/bundleIdCapabilities")['data'])
 if caps.any?{|c|c.dig('attributes','capabilityType')=='APP_GROUPS'}
  puts "APP_GROUPS already enabled for #{identifier}"
  next
 end
 body={data:{type:'bundleIdCapabilities',attributes:{capabilityType:'APP_GROUPS'},
    relationships:{bundleId:{data:{type:'bundleIds',id:id}}}}}
 request(token,:post,'/v1/bundleIdCapabilities',body)
 puts "Enabled APP_GROUPS for #{identifier}"
end
puts "Capability registered. The named group must still be registered and attached in Apple Developer UI."
