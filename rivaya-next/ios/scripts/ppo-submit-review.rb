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
versions=Array(api(:get,"/v1/apps/#{APP}/appStoreVersions?limit=100")['data'])
published=versions.find{|v|v.dig('attributes','versionString')=='4.4.1'}
abort('Published RIVAYA 4.4.1 missing; stop') unless published&.dig('attributes','appStoreState')=='READY_FOR_SALE'
experiments=Array(api(:get,"/v1/apps/#{APP}/appStoreVersionExperimentsV2?limit=40")['data'])
p=experiments.find{|e|e.dig('attributes','name')==NAME}
abort('PPO screenshot experiment missing') unless p
expid=p.fetch('id')
state=p.dig('attributes','state')
if %w[WAITING_FOR_REVIEW IN_REVIEW ACCEPTED APPROVED COMPLETED].include?(state)
 puts "SUCCESS: PPO already in Apple review or approved: #{state}"
 exit 0
end
abort("PPO unexpected state #{state}") unless %w[PREPARE_FOR_SUBMISSION READY_FOR_REVIEW].include?(state)
treatments=Array(api(:get,"/v2/appStoreVersionExperiments/#{expid}/appStoreVersionExperimentTreatments?limit=30")['data'])
abort('Expected exactly one New UI treatment') unless treatments.count{|t|t.dig('attributes','name')=='New UI'}==1
t=treatments.find{|x|x.dig('attributes','name')=='New UI'}
locs=Array(api(:get,"/v1/appStoreVersionExperimentTreatments/#{t.fetch('id')}/appStoreVersionExperimentTreatmentLocalizations?limit=50")['data'])
ru=locs.find{|x|x.dig('attributes','locale')=='ru'} || abort('PPO Russian localization missing')
sets=Array(api(:get,"/v1/appStoreVersionExperimentTreatmentLocalizations/#{ru.fetch('id')}/appScreenshotSets?limit=100")['data'])
set=sets.find{|s|s.dig('attributes','screenshotDisplayType')=='APP_IPHONE_67'} || abort('PPO screen set missing')
screens=Array(api(:get,"/v1/appScreenshotSets/#{set.fetch('id')}/appScreenshots?limit=100")['data'])
abort('Must have four PPO screenshots before submitting') unless screens.size==4
abort('Not all four screenshots processed') unless screens.all?{|x|x.dig('attributes','assetDeliveryState','state')=='COMPLETE'}
puts "Confirmed #{screens.size} COMPLETE screenshots for released 4.4.1 PPO."
submissions=Array(api(:get,"/v1/apps/#{APP}/reviewSubmissions?limit=100")['data'])
candidate=nil
submissions.each do |s|
 next unless %w[READY_FOR_REVIEW WAITING_FOR_REVIEW IN_REVIEW].include?(s.dig('attributes','state'))
 items=Array(api(:get,"/v1/reviewSubmissions/#{s.fetch('id')}/items?limit=100")['data'])
 next unless items.any?{|item|item.dig('relationships','appStoreVersionExperimentV2','data','id')==expid}
 abort('Existing PPO review submission includes unrelated app review items') unless items.size==1
 candidate=s
 break
end
if candidate
 puts "Existing PPO review submission #{candidate['id']} is #{candidate.dig('attributes','state')}"
 if %w[WAITING_FOR_REVIEW IN_REVIEW].include?(candidate.dig('attributes','state'))
  puts 'SUCCESS: screenshot-only experiment is already submitted for Apple review.'
  exit 0
 end
else
 submission=api(:post,'/v1/reviewSubmissions',{
   data:{type:'reviewSubmissions',relationships:{app:{data:{type:'apps',id:APP}}}}
 })
 candidate=submission.fetch('data')
 puts "Created screenshot-only Apple review submission: #{candidate['id']}"
 body={data:{type:'reviewSubmissionItems',relationships:{
    reviewSubmission:{data:{type:'reviewSubmissions',id:candidate.fetch('id')}},
    appStoreVersionExperimentV2:{data:{type:'appStoreVersionExperiments',id:expid}}
 }}}
 item=api(:post,'/v1/reviewSubmissionItems',body).fetch('data')
 puts "Attached PPO experiment as the ONLY review item: #{item['id']}"
end
subid=candidate.fetch('id')
items=Array(api(:get,"/v1/reviewSubmissions/#{subid}/items?limit=100")['data'])
abort('Unsafe review items: expected only the PPO experiment') unless items.size==1 &&
 items.first.dig('relationships','appStoreVersionExperimentV2','data','id')==expid
api(:patch,"/v1/reviewSubmissions/#{subid}",{
 data:{type:'reviewSubmissions',id:subid,attributes:{submitted:true}}
})
result=api(:get,"/v1/reviewSubmissions/#{subid}")
puts "SUCCESS: PPO screenshot-only Apple review submitted; state=#{result.dig('data','attributes','state')}, id=#{subid}"
puts 'Published 4.4.1 unchanged. Future 4.4.2 draft unchanged.'
