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
# Finish only the previously inspected single PPO submission. Never touch another app version.
subid='d3930f5b-3069-46c2-9dda-824148ec5a90'
expid='74638c9c-1695-4a46-8667-cadb324ca7ef'
submission=api(:get,"/v1/reviewSubmissions/#{subid}").fetch('data')
state=submission.dig('attributes','state')
items=Array(api(:get,"/v1/reviewSubmissions/#{subid}/items?limit=100&include=appStoreVersionExperimentV2")['data'])
abort("Unsafe review submission: #{items.size} items or wrong experiment") unless items.size==1 &&
 items.first.dig('relationships','appStoreVersionExperimentV2','data','id')==expid
if %w[WAITING_FOR_REVIEW IN_REVIEW COMPLETE].include?(state)
 puts "SUCCESS: RIVAYA PPO review already submitted, state=#{state}"
 exit 0
end
abort("Unsafe review submission state #{state}") unless state=='READY_FOR_REVIEW'
puts 'Verified EXACTLY one PPO experiment item in the Apple review submission.'
api(:patch,"/v1/reviewSubmissions/#{subid}",{
 data:{type:'reviewSubmissions',id:subid,attributes:{submitted:true}}
})
result=api(:get,"/v1/reviewSubmissions/#{subid}")
actual=result.dig('data','attributes','state')
abort("Review was not confirmed submitted: #{actual}") unless %w[WAITING_FOR_REVIEW IN_REVIEW COMPLETING COMPLETE].include?(actual)
puts "SUCCESS: RIVAYA 4.4.1 new screenshots submitted independently to Apple App Review, state=#{actual}"
puts 'Published binary untouched, new app release NOT submitted.'
