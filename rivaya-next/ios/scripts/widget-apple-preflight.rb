#!/usr/bin/env ruby
# Read-only authorization preflight: no mutations to developer account.
require 'openssl'
require 'base64'
require 'json'
require 'net/http'
require 'uri'
require 'jwt'
key = OpenSSL::PKey::EC.new(Base64.strict_decode64(ENV.fetch('ASC_KEY_P8_BASE64').delete("\r\n")))
token = JWT.encode({iss:ENV.fetch('ASC_ISSUER_ID'),iat:Time.now.to_i-10,exp:Time.now.to_i+300,aud:'appstoreconnect-v1'},key,'ES256',{kid:ENV.fetch('ASC_KEY_ID'),typ:'JWT'})
def fetch(token, path)
 uri=URI("https://api.appstoreconnect.apple.com#{path}")
 req=Net::HTTP::Get.new(uri)
 req['Authorization']="Bearer #{token}"
 res=Net::HTTP.start(uri.host,uri.port,use_ssl:true,open_timeout:15,read_timeout:25){|h|h.request(req)}
 data=JSON.parse(res.body) rescue {}
 errors=Array(data['errors']).map{|x|x['detail']||x['title']}.compact.join('; ')
 puts "#{uri.path}: HTTP #{res.code} #{errors[0,180]}"
 data['data'] || []
end
app=fetch(token,'/v1/bundleIds?filter%5Bidentifier%5D=app.rivaya.smart01&limit=5')
widget=fetch(token,'/v1/bundleIds?filter%5Bidentifier%5D=app.rivaya.smart01.widgets&limit=5')
cert=fetch(token,'/v1/certificates?filter%5BcertificateType%5D=DISTRIBUTION&limit=20')
prof=fetch(token,'/v1/profiles?filter%5BprofileType%5D=IOS_APP_STORE&limit=30')
fetch(token,'/v1/appGroups?limit=5')
if app.is_a?(Array) && !app.empty?
  fetch(token, "/v1/bundleIds/#{app[0].fetch('id')}/bundleIdCapabilities?limit=50")
end
if app.is_a?(Array)
 puts "Main bundle id: #{app.empty? ? 'not accessible' : 'exists'}"
end
if widget.is_a?(Array)
 puts "Widget bundle id: #{widget.empty? ? 'not registered' : 'exists'}"
end
if cert.is_a?(Array)
 puts "Distribution certificates accessible: #{cert.length}"
end
if prof.is_a?(Array)
 puts "App Store profiles accessible: #{prof.length}"
end
