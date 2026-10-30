#!/usr/bin/env ruby
# Read-only App Store Connect status check for release planning.
require 'json'
require 'uri'
require 'openssl'
require 'base64'
require 'net/http'
require 'jwt'
key=OpenSSL::PKey::EC.new(Base64.strict_decode64(ENV.fetch('ASC_KEY_P8_BASE64').delete("\r\n")))
def call(key,path)
  now=Time.now.to_i
  token=JWT.encode({iss:ENV.fetch('ASC_ISSUER_ID'),iat:now-10,exp:now+600,aud:'appstoreconnect-v1'},key,'ES256',{kid:ENV.fetch('ASC_KEY_ID'),typ:'JWT'})
  uri=URI("https://api.appstoreconnect.apple.com#{path}")
  req=Net::HTTP::Get.new(uri);req['Authorization']="Bearer #{token}";req['Accept']='application/json'
  res=Net::HTTP.start(uri.host,uri.port,use_ssl:true,open_timeout:20,read_timeout:35){|http|http.request(req)}
  parsed=JSON.parse(res.body) rescue {}
  unless (200..299).cover?(res.code.to_i)
    message=Array(parsed['errors']).map{|e|e['detail']||e['title']}.compact.join('; ')
    abort("ASC status query HTTP #{res.code}: #{message[0,280]}")
  end
  parsed
end
app='6823716293'
versions=call(key,"/v1/apps/#{app}/appStoreVersions?#{URI.encode_www_form([['filter[platform]','IOS'],['limit','50']])}")
puts "App Store iOS versions:"
Array(versions['data']).each do |v|
  version=v.dig('attributes','versionString')
  state=v.dig('attributes','appStoreState')
  puts "- version=#{version}, state=#{state}, id=#{v['id']}"
  next unless ['4.3.1','4.4.0','4.4.1'].include?(version)
  build=call(key,"/v1/appStoreVersions/#{v['id']}/build")
  info=build['data']
  puts "  linked build=#{info&.dig('attributes','version') || 'none'}, id=#{info&.dig('id') || 'none'}"
end
builds=call(key,"/v1/builds?#{URI.encode_www_form([['filter[app]',app],['filter[version]','45001'],['limit','30']])}")
Array(builds['data']).each do |b|
  puts "TestFlight build #{b.dig('attributes','version')}: processing=#{b.dig('attributes','processingState')}, id=#{b['id']}"
end
