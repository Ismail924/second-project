#!/usr/bin/env ruby
# Submit ONLY RIVAYA Product Page Optimization screenshots to App Review.
# This does not submit a new iOS binary or update published screenshots yet.
require 'net/http'
require 'uri'
require 'json'
require 'jwt'
require 'openssl'
require 'base64'
APP='6823716293'
NAME='RIVAYA 2026 new Habit Screens'
def api(method,path,body=nil)
 uri=URI("https://api.appstoreconnect.apple.com#{path}")
 key=OpenSSL::PKey::EC.new(Base64.strict_decode64(ENV.fetch('ASC_KEY_P8_BASE64').delete("\r\n")))
 now=Time.now.to_i
 jwt=JWT.encode({iss:ENV.fetch('ASC_ISSUER_ID'),iat:now-10,exp:now+850,aud:'appstoreconnect-v1'},key,'ES256',{kid:ENV.fetch('ASC_KEY_ID'),typ:'JWT'})
 req={get:Net::HTTP::Get,post:Net::HTTP::Post,patch:Net::HTTP::Patch}.fetch(method).new(uri)
 req['Authorization']="Bearer #{jwt}";req['Accept']='application/json';req['Content-Type']='application/json'
 req.body=JSON.generate(body) if body
 res=Net::HTTP.start(uri.host,uri.port,use_ssl:true,open_timeout:20,read_timeout:45){|h|h.request(req)}
 data=res.body.to_s.empty? ? {} : (JSON.parse(res.body) rescue {})
 unless (200..299).include?(res.code.to_i)
  msg=Array(data['errors']).map{|e|"#{e['code']} #{e['detail']||e['title']}"}.join('; ')
  abort("Apple App Review API #{method} #{uri.path} HTTP #{res.code}: #{msg[0,480]}")
 end
 data
end

subid='d3930f5b-3069-46c2-9dda-824148ec5a90'
puts "Submission: "+JSON.generate(api(:get,"/v1/reviewSubmissions/#{subid}")['data'])
items=Array(api(:get,"/v1/reviewSubmissions/#{subid}/items?limit=100&include=appStoreVersionExperimentV2")['data'])
puts "Submission item count: #{items.size}"
items.each do |i|
 puts "Item: #{i['id']}, type=#{i['type']}, state=#{i.dig('attributes','state')}"
 puts "Relationships: "+JSON.generate(i['relationships'])
 end
