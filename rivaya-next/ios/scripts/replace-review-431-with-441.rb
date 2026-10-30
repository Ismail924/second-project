#!/usr/bin/env ruby
# Owner-authorized replacement of pending RIVAYA 4.3.1 review with the already-tested
# RIVAYA 4.4.1 (45001) build. Do not touch public builds, other platforms or data.
require 'json'
require 'uri'
require 'openssl'
require 'base64'
require 'net/http'
require 'jwt'
APP_ID='6823716293'
OLD='4.3.1'; NEW='4.4.1'; BUILD='45001'
RU='Улучшили виджеты RIVAYA для iPhone. Компактный виджет получил аккуратный круг прогресса, а список привычек — более удобный дизайн, читаемые индикаторы и компактное расположение. Большой виджет остаётся доступным по желанию. История и данные привычек сохранены.'
EN='Improved RIVAYA Home Screen widgets for iPhone. The small widget has a polished progress ring; habit lists are cleaner, more readable and compact. The large widget is still optional. Your habit history and data are preserved.'
def api(method,path,payload=nil,allowed=[200,201,204])
 uri=URI("https://api.appstoreconnect.apple.com#{path}")
 key=OpenSSL::PKey::EC.new(Base64.strict_decode64(ENV.fetch('ASC_KEY_P8_BASE64').delete("\r\n")))
 now=Time.now.to_i
 jwt=JWT.encode({iss:ENV.fetch('ASC_ISSUER_ID'),iat:now-15,exp:now+850,aud:'appstoreconnect-v1'},key,'ES256',{kid:ENV.fetch('ASC_KEY_ID'),typ:'JWT'})
 request=case method
 when :patch then Net::HTTP::Patch.new(uri)
 when :post then Net::HTTP::Post.new(uri)
 else Net::HTTP::Get.new(uri)
 end
 request['Authorization']="Bearer #{jwt}"
 request['Content-Type']='application/json'
 request['Accept']='application/json'
 request.body=JSON.generate(payload) if payload
 response=Net::HTTP.start(uri.host,uri.port,use_ssl:true,open_timeout:20,read_timeout:45){|h|h.request(request)}
 data=response.body.to_s.empty? ? {} : (JSON.parse(response.body) rescue {})
 code=response.code.to_i
 unless allowed.include?(code)
  reason=Array(data['errors']).map{|e|"#{e['code']} #{e['detail']||e['title']}"}.join('; ')
  abort("Apple API #{method.to_s.upcase} #{uri.path}: HTTP #{code} #{reason[0,450]}")
 end
 data
end
def versions
  Array(api(:get,"/v1/apps/#{APP_ID}/appStoreVersions?#{URI.encode_www_form([['filter[platform]','IOS'],['limit','100']])}")['data'])
end
def get_version(number)
  versions.find{|v|v.dig('attributes','versionString')==number}
end

# Validate exact processed Apple build BEFORE withdrawing anything.
builds=api(:get,"/v1/builds?#{URI.encode_www_form([['filter[app]',APP_ID],['filter[version]',BUILD],['include','preReleaseVersion'],['limit','100']])}")
chosen=Array(builds['data']).find do |b|
  related=b.dig('relationships','preReleaseVersion','data','id')
  pre=Array(builds['included']).find{|i|i['type']=='preReleaseVersions' && i['id']==related}
  pre&.dig('attributes','version')==NEW && b.dig('attributes','processingState')=='VALID'
end
abort("SAFE BLOCK: RIVAYA #{NEW} build #{BUILD} is not VALID.") unless chosen
puts "Confirmed Apple valid binary: RIVAYA #{NEW} (#{BUILD}) id=#{chosen.fetch('id')}"
live=versions
old=live.find{|v|v.dig('attributes','versionString')==OLD}
target=live.find{|v|v.dig('attributes','versionString')==NEW}
if target && %w[WAITING_FOR_REVIEW IN_REVIEW READY_FOR_DISTRIBUTION READY_FOR_SALE PENDING_APPLE_RELEASE].include?(target.dig('attributes','appStoreState'))
 puts "SUCCESS: RIVAYA #{NEW} already queued or approved. Not cancelling anything."
 exit 0
end
abort("Old RIVAYA #{OLD} App Store version missing; stop without cancelling unrelated submissions.") unless old || target
puts "Existing: "+live.map{|v|"#{v.dig('attributes','versionString')}:#{v.dig('attributes','appStoreState')}"}.join(' | ')

# Only cancel the review if the submission is exactly the requested old app version.
if old && %w[WAITING_FOR_REVIEW IN_REVIEW].include?(old.dig('attributes','appStoreState'))
 submissions=api(:get,"/v1/apps/#{APP_ID}/reviewSubmissions?include=appStoreVersionForReview&limit=100")
 active=Array(submissions['data']).select{|s|%w[WAITING_FOR_REVIEW IN_REVIEW].include?(s.dig('attributes','state')) && s.dig('attributes','platform')=='IOS'}
 correct=active.select do |s|
   link=s.dig('relationships','appStoreVersionForReview','data','id')
   if link.nil?
     details=api(:get,"/v1/reviewSubmissions/#{s.fetch('id')}/items?include=appStoreVersion&limit=50")
     link=Array(details['data']).map{|i|i.dig('relationships','appStoreVersion','data','id')}.compact.first
   end
   link==old.fetch('id')
 end
 abort("SAFE BLOCK: Cannot uniquely identify the 4.3.1 active review submission (matches=#{correct.size}).") unless correct.size==1
 review=correct.first
 details=api(:get,"/v1/reviewSubmissions/#{review.fetch('id')}/items?include=appStoreVersion&limit=50")
 items=Array(details['data'])
 abort("SAFE BLOCK: The 4.3.1 review includes #{items.size} items, not only the app. Avoid cancelling unrelated items.") unless items.size==1
 puts "Cancelling specifically RIVAYA #{OLD} submission #{review.fetch('id')}."
 api(:patch,"/v1/reviewSubmissions/#{review.fetch('id')}",{data:{type:'reviewSubmissions',id:review.fetch('id'),attributes:{canceled:true}}})
 deadline=Time.now+500
 loop do
   current=get_version(OLD)
   state=current&.dig('attributes','appStoreState')
   puts "Previous version state: #{state}"
   break if %w[DEVELOPER_REJECTED PREPARE_FOR_SUBMISSION].include?(state)
   abort("Cancel did not unlock old version, current state #{state}") if Time.now>=deadline
   sleep 15
 end
end

# Prefer editing the same existing unreleased version. This retains all
# metadata/screenshots and avoids creating a second version of the same iOS app.
target=get_version(NEW)
unless target
 old=get_version(OLD)
 abort("Old version is not editable") unless old && %w[DEVELOPER_REJECTED PREPARE_FOR_SUBMISSION REJECTED].include?(old.dig('attributes','appStoreState'))
 old_id=old.fetch('id')
 updated=api(:patch,"/v1/appStoreVersions/#{old_id}",{
   data:{type:'appStoreVersions',id:old_id,attributes:{versionString:NEW,releaseType:'AFTER_APPROVAL'}}
 })
 abort("Version rename failed to persist") unless updated.dig('data','attributes','versionString')==NEW
 puts "Renamed the existing unreleased App Store version #{OLD} → #{NEW}; screenshots and other metadata retained."
 target=updated.fetch('data')
end
abort("Target app version unexpected: #{target.dig('attributes','appStoreState')}") unless %w[DEVELOPER_REJECTED PREPARE_FOR_SUBMISSION REJECTED METADATA_REJECTED INVALID_BINARY].include?(target.dig('attributes','appStoreState'))
version_id=target.fetch('id')
# Set the chosen VALID build explicitly on this appStoreVersion, and verify.
api(:patch,"/v1/appStoreVersions/#{version_id}",{data:{type:'appStoreVersions',id:version_id,
  relationships:{build:{data:{type:'builds',id:chosen.fetch('id')}}}}})
linked=api(:get,"/v1/appStoreVersions/#{version_id}/build")
abort("Build association mismatch!") unless linked.dig('data','id')==chosen.fetch('id')
puts "Attached the exact iOS build #{BUILD} to version #{NEW}."
loc=api(:get,"/v1/appStoreVersions/#{version_id}/appStoreVersionLocalizations?limit=100")
items=Array(loc['data'])
abort("No release localizations. Cannot submit.") if items.empty?
items.each do |l|
 id=l.fetch('id');locale=l.dig('attributes','locale').to_s
 notes=locale.downcase.start_with?('ru') ? RU : EN
 api(:patch,"/v1/appStoreVersionLocalizations/#{id}",{data:{type:'appStoreVersionLocalizations',id:id,attributes:{whatsNew:notes}}})
 puts "Set What's New for #{locale}"
end
puts "SUCCESS: RIVAYA #{NEW} (#{BUILD}) prepared for review submission."
