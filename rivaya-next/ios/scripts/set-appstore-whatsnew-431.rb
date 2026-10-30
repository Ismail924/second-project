#!/usr/bin/env ruby
# Populate Apple's required What's New for the exact RIVAYA 4.3.1 App Store version.
require 'json'
require 'net/http'
require 'uri'
require 'openssl'
require 'base64'
require 'jwt'

APP_ID = '6823716293'
VERSION = '4.3.1'
RU_NOTES = 'Исправили выравнивание кругов прогресса в календаре. Выполненные привычки теперь автоматически скрываются из списка на сегодня и остаются в разделе «Выполнено сегодня», где можно отменить отметку. На следующий запланированный день они появляются снова. История и статистика сохраняются.'
EN_NOTES = "Fixed the alignment of progress rings in the weekly calendar. Completed habits now move out of today's active list into a collapsible Completed Today section, where you can undo a completion. Habits return on their next scheduled day, with history and progress preserved."

def call_api(method, path, data = nil)
  uri = URI("https://api.appstoreconnect.apple.com#{path}")
  now = Time.now.to_i
  key = OpenSSL::PKey::EC.new(Base64.strict_decode64(ENV.fetch('ASC_KEY_P8_BASE64').delete("\r\n")))
  jwt = JWT.encode({iss: ENV.fetch('ASC_ISSUER_ID'),iat: now-15,exp: now+900,aud: 'appstoreconnect-v1'},key,'ES256',{kid:ENV.fetch('ASC_KEY_ID'),typ:'JWT'})
  req = (method == :patch ? Net::HTTP::Patch : Net::HTTP::Get).new(uri)
  req['Authorization'] = "Bearer #{jwt}"
  req['Content-Type'] = 'application/json'
  req['Accept'] = 'application/json'
  req.body = JSON.generate(data) if data
  response = Net::HTTP.start(uri.host,uri.port,use_ssl:true,open_timeout:20,read_timeout:40){|http| http.request(req)}
  result = response.body.to_s.empty? ? {} : (JSON.parse(response.body) rescue {})
  unless (200..299).cover?(response.code.to_i)
    errors=Array(result['errors']).map{|e| e['detail']||e['title']}.compact.join('; ')
    abort("Apple App Store version metadata API #{method} #{uri.path}: HTTP #{response.code} #{errors[0,350]}")
  end
  result
end

versions = call_api(:get, "/v1/appStoreVersions?#{URI.encode_www_form([['filter[app]',APP_ID],['filter[platform]','IOS'],['limit','100']])}")
match = Array(versions['data']).find { |v| v.dig('attributes','versionString') == VERSION }
abort('Version 4.3.1 not found in App Store Connect') unless match
state = match.dig('attributes','appStoreState')
abort("App Store version cannot be edited in state #{state}") if %w[READY_FOR_SALE PENDING_DEVELOPER_RELEASE WAITING_FOR_REVIEW IN_REVIEW].include?(state)
version_id = match.fetch('id')
result = call_api(:get, "/v1/appStoreVersionLocalizations?#{URI.encode_www_form([['filter[appStoreVersion]',version_id],['limit','200']])}")
localizations = Array(result['data'])
abort('No App Store localizations exist; metadata must be prepared') if localizations.empty?
localizations.each do |item|
  id = item.fetch('id')
  locale = item.dig('attributes','locale').to_s
  text = locale.downcase.start_with?('ru') ? RU_NOTES : EN_NOTES
  call_api(:patch, "/v1/appStoreVersionLocalizations/#{id}", {data:{type:'appStoreVersionLocalizations',id:id,attributes:{whatsNew:text}}})
  puts "Verified What's New for #{locale}, version #{VERSION}"
end
puts "SUCCESS: App Store #{VERSION} has What's New in #{localizations.size} locales."
