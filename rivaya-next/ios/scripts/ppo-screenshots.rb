#!/usr/bin/env ruby
# RIVAYA approved-screen PPO draft: does not start the experiment or touch live screenshots.
# Create one variant for currently released 4.4.1 using the real web UI captures.
require 'json'
require 'net/http'
require 'uri'
require 'openssl'
require 'base64'
require 'jwt'
require 'digest'
APP='6823716293'
NAME='RIVAYA 2026 new Habit Screens'
FILES=%w[01_today.png 02_plan.png 03_progress.png 04_profile.png]
FOLDER=File.expand_path('../../../appstore-shots-442',__dir__)
def request(method,path,body=nil,allow_errors:false)
 uri=URI("https://api.appstoreconnect.apple.com#{path}")
 key=OpenSSL::PKey::EC.new(Base64.strict_decode64(ENV.fetch('ASC_KEY_P8_BASE64').delete("\r\n")))
 now=Time.now.to_i
 token=JWT.encode({iss:ENV.fetch('ASC_ISSUER_ID'),iat:now-12,exp:now+780,aud:'appstoreconnect-v1'},key,'ES256',{kid:ENV.fetch('ASC_KEY_ID'),typ:'JWT'})
 req= {get:Net::HTTP::Get,post:Net::HTTP::Post,patch:Net::HTTP::Patch}.fetch(method).new(uri)
 req['Authorization']="Bearer #{token}"
 req['Accept']='application/json'
 req['Content-Type']='application/json'
 req.body=JSON.generate(body) if body
 res=Net::HTTP.start(uri.host,uri.port,use_ssl:true,open_timeout:20,read_timeout:50){|h|h.request(req)}
 data=res.body.to_s.empty? ? {} : (JSON.parse(res.body) rescue {})
 unless (200..299).include?(res.code.to_i)
  msg=Array(data['errors']).map{|e|"#{e['code']} #{e['detail']||e['title']}"}.compact.join('; ')
  abort("Apple API #{method} #{uri.path}: HTTP #{res.code} #{msg[0,400]}") unless allow_errors
  return [res.code.to_i,data]
 end
 allow_errors ? [res.code.to_i,data] : data
end
def pending_images(operations,bytes)
 Array(operations).each do |op|
  data=bytes.byteslice(op.fetch('offset'),op.fetch('length'))
  abort('Apple image chunk length mismatch') unless data&.bytesize==op.fetch('length')
  url=URI(op.fetch('url'))
  abort('Apple upload URL must use HTTPS') unless url.scheme=='https'
  response=nil
  3.times do |attempt|
   r=Net::HTTP::Put.new(url)
   Array(op['requestHeaders']).each{|h|r[h.fetch('name')]=h.fetch('value')}
   r.body=data
   response=Net::HTTP.start(url.host,url.port,use_ssl:true,open_timeout:20,read_timeout:100){|http|http.request(r)}
   break if (200..299).include?(response.code.to_i)
   sleep 3*(attempt+1)
  end
  abort("Apple chunk upload HTTP #{response.code}") unless (200..299).include?(response.code.to_i)
 end
end
versions=Array(request(:get,"/v1/apps/#{APP}/appStoreVersions?limit=100")['data'])
v=versions.find{|a|a.dig('attributes','versionString')=='4.4.1'}
abort('RIVAYA 4.4.1 not published; do not create live-page test') unless v&.dig('attributes','appStoreState')=='READY_FOR_SALE'
arr=Array(request(:get,"/v1/apps/#{APP}/appStoreVersionExperimentsV2?limit=50")['data'])
active=arr.select{|e|!%w[COMPLETED STOPPED REJECTED].include?(e.dig('attributes','state'))}
other=active.find{|e|e.dig('attributes','name')!=NAME}
abort("An existing product page experiment #{other.dig('attributes','name')} is active, nothing changed") if other
exp=active.find{|e|e.dig('attributes','name')==NAME}
unless exp
 payload={data:{type:'appStoreVersionExperiments',attributes:{name:NAME,platform:'IOS',trafficProportion:50},
  relationships:{app:{data:{type:'apps',id:APP}}}}}
 exp=request(:post,'/v2/appStoreVersionExperiments',payload).fetch('data')
 puts "PPO created as draft, id=#{exp['id']}"
end
expid=exp.fetch('id')
state=exp.dig('attributes','state')
abort("PPO state is #{state}; can't change screenshots") unless state=='PREPARE_FOR_SUBMISSION'
puts "PPO draft #{expid}, state=#{state}"
treatments=Array(request(:get,"/v2/appStoreVersionExperiments/#{expid}/appStoreVersionExperimentTreatments?limit=20")['data'])
t=treatments.find{|x|x.dig('attributes','name')=='New UI'}
unless t
 body={data:{type:'appStoreVersionExperimentTreatments',attributes:{name:'New UI'},
  relationships:{appStoreVersionExperimentV2:{data:{type:'appStoreVersionExperiments',id:expid}}}}}
 t=request(:post,'/v1/appStoreVersionExperimentTreatments',body).fetch('data')
 puts "Created screenshot-only treatment id=#{t['id']}"
end
locales=Array(request(:get,"/v1/appStoreVersionExperimentTreatments/#{t.fetch('id')}/appStoreVersionExperimentTreatmentLocalizations?limit=100")['data'])
ru=locales.find{|x|x.dig('attributes','locale')=='ru'}
unless ru
 body={data:{type:'appStoreVersionExperimentTreatmentLocalizations',attributes:{locale:'ru'},
   relationships:{appStoreVersionExperimentTreatment:{data:{type:'appStoreVersionExperimentTreatments',id:t.fetch('id')}}}}}
 ru=request(:post,'/v1/appStoreVersionExperimentTreatmentLocalizations',body).fetch('data')
 puts "Created RU treatment localization id=#{ru['id']}"
end
sets=Array(request(:get,"/v1/appStoreVersionExperimentTreatmentLocalizations/#{ru.fetch('id')}/appScreenshotSets?limit=100")['data'])
s=sets.find{|x|x.dig('attributes','screenshotDisplayType')=='APP_IPHONE_67'}
unless s
 body={data:{type:'appScreenshotSets',attributes:{screenshotDisplayType:'APP_IPHONE_67'},
    relationships:{appStoreVersionExperimentTreatmentLocalization:{data:{type:'appStoreVersionExperimentTreatmentLocalizations',id:ru.fetch('id')}}}}}
 s=request(:post,'/v1/appScreenshotSets',body).fetch('data')
 puts "Created APP_IPHONE_67 treatment screenshot set id=#{s['id']}"
end
setid=s.fetch('id')
existing=Array(request(:get,"/v1/appScreenshotSets/#{setid}/appScreenshots?limit=100")['data'])
FILES.each do |name|
 path=File.join(FOLDER,name)
 abort("RIVAYA screenshot not present: #{path}") unless File.file?(path)
 bytes=File.binread(path)
 abort('Not iPhone PNG') unless bytes.byteslice(0,8)=="\x89PNG\r\n\x1a\n".b && bytes.byteslice(16,8).unpack('N2')==[1320,2868]
 md5=Digest::MD5.hexdigest(bytes)
 old=existing.find{|x|x.dig('attributes','fileName')==name && x.dig('attributes','assetDeliveryState','state')=='COMPLETE'}
 if old
  puts "PPO image already uploaded: #{name}"
  next
 end
 req={data:{type:'appScreenshots',attributes:{fileName:name,fileSize:bytes.bytesize},
    relationships:{appScreenshotSet:{data:{type:'appScreenshotSets',id:setid}}}}}
 img=request(:post,'/v1/appScreenshots',req).fetch('data')
 id=img.fetch('id')
 pending_images(img.dig('attributes','uploadOperations'),bytes)
 request(:patch,"/v1/appScreenshots/#{id}",{data:{type:'appScreenshots',id:id,attributes:{uploaded:true,sourceFileChecksum:md5}}})
 30.times do
  d=request(:get,"/v1/appScreenshots/#{id}")
  status=d.dig('data','attributes','assetDeliveryState','state')
  break if status=='COMPLETE'
  abort("PPO screenshot failed: #{name}: #{status}") if status=='FAILED'
  sleep 5
 end
 result=request(:get,"/v1/appScreenshots/#{id}")
 abort("Apple has not processed PPO screenshot #{name}") unless result.dig('data','attributes','assetDeliveryState','state')=='COMPLETE'
 puts "APPLE PPO image COMPLETE: #{name}"
end
count=Array(request(:get,"/v1/appScreenshotSets/#{setid}/appScreenshots?limit=100")['data']).count
abort("Expected 4 PPO screenshots, found #{count}") unless count==4
puts "SUCCESS: PPO draft #{NAME} has 4 accepted real UI screenshots, ready for Apple App Review submission."
puts 'Published RIVAYA 4.4.1 unchanged; PPO not started, screenshots on live store still old.'
