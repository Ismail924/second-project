#!/usr/bin/env ruby
# Prepare the existing signed TestFlight binary for an App Store version only
# if Apple permits a new iOS release. Never withdraw a review submission.
require 'json'
require 'uri'
require 'openssl'
require 'base64'
require 'net/http'
require 'jwt'

APP_ID='6823716293'
VERSION='4.4.1'
BUILD_NUMBER='45001'
RU_NOTES='Обновили виджеты RIVAYA для главного экрана iPhone: улучшили круг прогресса и дизайн компактного списка привычек. Добавили удобные отступы, показатели выполненных задач и более аккуратные индикаторы. Большой виджет остаётся дополнительным вариантом. Исправления не затрагивают историю привычек.'
EN_NOTES='Refreshed RIVAYA iPhone widgets with a polished progress ring and cleaner compact habit list. Improved layout, progress indicators, spacing and readability. The large widget remains optional. Habit history is preserved.'

def api(method,path,payload=nil)
  uri=URI("https://api.appstoreconnect.apple.com#{path}")
  now=Time.now.to_i
  key=OpenSSL::PKey::EC.new(Base64.strict_decode64(ENV.fetch('ASC_KEY_P8_BASE64').delete("\r\n")))
  token=JWT.encode({iss:ENV.fetch('ASC_ISSUER_ID'),iat:now-15,exp:now+850,aud:'appstoreconnect-v1'},key,'ES256',{kid:ENV.fetch('ASC_KEY_ID'),typ:'JWT'})
  request=case method
  when :post then Net::HTTP::Post.new(uri)
  when :patch then Net::HTTP::Patch.new(uri)
  else Net::HTTP::Get.new(uri)
  end
  request['Authorization']="Bearer #{token}"
  request['Accept']='application/json'
  request['Content-Type']='application/json'
  request.body=JSON.generate(payload) if payload
  response=Net::HTTP.start(uri.host,uri.port,use_ssl:true,open_timeout:20,read_timeout:45){|http|http.request(request)}
  body=response.body.to_s.empty? ? {} : (JSON.parse(response.body) rescue {})
  unless (200..299).cover?(response.code.to_i)
    msg=Array(body['errors']).map{|x|x['detail']||x['title']}.compact.join('; ')
    abort("App Store Connect #{method} #{uri.path}: HTTP #{response.code}: #{msg[0,360]}")
  end
  body
end

builds=api(:get,"/v1/builds?#{URI.encode_www_form([['filter[app]',APP_ID],['filter[version]',BUILD_NUMBER],['include','preReleaseVersion'],['limit','30']])}")
build=nil
Array(builds['data']).each do |b|
  release=Array(builds['included']).find{|i|i['type']=='preReleaseVersions' && i['id']==b.dig('relationships','preReleaseVersion','data','id')}
  next unless release&.dig('attributes','version')==VERSION
  next unless b.dig('attributes','processingState')=='VALID'
  build=b
  break
end
abort("Exact TestFlight build #{VERSION} (#{BUILD_NUMBER}) is not valid; stopping") unless build
puts "Apple confirms exact build #{VERSION} (#{BUILD_NUMBER}), VALID."

versions=api(:get,"/v1/apps/#{APP_ID}/appStoreVersions?#{URI.encode_www_form([['filter[platform]','IOS'],['limit','100']])}")
entries=Array(versions['data'])
entries.each{|v| puts "iOS App Store version #{v.dig('attributes','versionString')}: #{v.dig('attributes','appStoreState')}"}
target=entries.find{|v|v.dig('attributes','versionString')==VERSION}
if target && %w[WAITING_FOR_REVIEW IN_REVIEW PENDING_APPLE_RELEASE PENDING_DEVELOPER_RELEASE READY_FOR_DISTRIBUTION READY_FOR_SALE].include?(target.dig('attributes','appStoreState'))
  puts "Version #{VERSION} is already submitted or published; no duplicate submission."
  exit 0
end

# Apple permits only one iOS app version submitted for App Review at once.
blocking=%w[WAITING_FOR_REVIEW IN_REVIEW PENDING_APPLE_RELEASE PENDING_DEVELOPER_RELEASE]
older=entries.reject{|v|v.dig('attributes','versionString')==VERSION}
busy=older.find{|v|blocking.include?(v.dig('attributes','appStoreState'))}
if busy
  abort("SAFE BLOCK: iOS #{busy.dig('attributes','versionString')} is #{busy.dig('attributes','appStoreState')}. Cannot submit 4.4.1 without withdrawing earlier review. No review was cancelled.")
end
previous=older.find{|v|v.dig('attributes','versionString')=='4.3.1'}
if previous && !%w[READY_FOR_DISTRIBUTION READY_FOR_SALE].include?(previous.dig('attributes','appStoreState'))
  abort("SAFE BLOCK: iOS 4.3.1 state #{previous.dig('attributes','appStoreState')} is not released. Existing review remains untouched.")
end
unless target
  body={data:{type:'appStoreVersions',attributes:{versionString:VERSION,platform:'IOS'},
    relationships:{app:{data:{type:'apps',id:APP_ID}}}}}
  target=api(:post,'/v1/appStoreVersions',body).fetch('data')
  puts "Created App Store version #{VERSION}."
end
id=target.fetch('id')
state=target.dig('attributes','appStoreState')
abort("App Store version #{VERSION} is not editable: #{state}") unless %w[PREPARE_FOR_SUBMISSION DEVELOPER_REJECTED REJECTED METADATA_REJECTED INVALID_BINARY].include?(state)

localizations=api(:get,"/v1/appStoreVersions/#{id}/appStoreVersionLocalizations?limit=200")
items=Array(localizations['data'])
abort("Version #{VERSION} has no inherited App Store localizations") if items.empty?
items.each do |item|
  locale=item.dig('attributes','locale').to_s
  notes=locale.downcase.start_with?('ru') ? RU_NOTES : EN_NOTES
  loc_id=item.fetch('id')
  api(:patch,"/v1/appStoreVersionLocalizations/#{loc_id}",{data:{type:'appStoreVersionLocalizations',id:loc_id,attributes:{whatsNew:notes}}})
  puts "What's New prepared for #{locale}"
end
puts "READY: version #{VERSION} has localized What's New; submitting the existing build #{BUILD_NUMBER} is permitted."
