#!/usr/bin/env ruby
# Owner-approved ASO metadata tuning. Live release: promotional text ONLY.
# Next 4.4.2 draft: metadata, keywords and subtitle only. No binary submission.
require 'net/http'
require 'uri'
require 'json'
require 'jwt'
require 'openssl'
require 'base64'
APP_ID='6823716293'
PROMO='RIVAYA — привычки, цели и прогресс на каждый день. Новые виджеты iPhone, напоминания и реальные шаги из Apple Health. Бесплатно, без рекламы.'
SUBTITLE='Привычки, цели и прогресс'
KEYWORDS='ривая,ривайя,трекер,ежедневник,задачи,шаги,статистика,мотивация,дисциплина,напоминания,накопления'
DESCRIPTION=<<~TEXT.strip
  RIVAYA — удобный трекер привычек, задач и целей. Планируй день, отмечай выполненное и замечай свой прогресс, даже если начинаешь с одной привычки.

  • Сегодня: привычки на день, удобная отметка выполнения и круг прогресса.
  • Виджеты iPhone: процент выполненного, серия дней и привычки прямо на главном экране. Нажатие открывает RIVAYA.
  • План: личные цели, этапы, привычки и накопления.
  • Прогресс: статистика по неделям, месяцам и году.
  • Напоминания: своё время для привычек и целей, тихий режим.
  • Шаги: автоматическое чтение активности из Apple Health с твоего разрешения.
  • Профиль: настройки и дневная цель по шагам.

  RIVAYA работает без обязательной регистрации. Данные сохраняются на устройстве; для переноса доступен экспорт и восстановление файла. Облачной синхронизации в этой версии нет.

  Бесплатно, без рекламы и подписок. Двигайся к своим целям в удобном темпе.
TEXT
abort('Promo exceeds 170 characters') if PROMO.length > 170
abort('Subtitle exceeds 30 characters') if SUBTITLE.length > 30
abort('Keywords exceed 100 characters') if KEYWORDS.length > 100
def api(method,path,payload=nil)
 uri=URI("https://api.appstoreconnect.apple.com#{path}")
 key=OpenSSL::PKey::EC.new(Base64.strict_decode64(ENV.fetch('ASC_KEY_P8_BASE64').delete("\r\n")))
 now=Time.now.to_i
 token=JWT.encode({iss:ENV.fetch('ASC_ISSUER_ID'),iat:now-10,exp:now+850,aud:'appstoreconnect-v1'},key,'ES256',{kid:ENV.fetch('ASC_KEY_ID'),typ:'JWT'})
 cls={get:Net::HTTP::Get,patch:Net::HTTP::Patch}.fetch(method)
 req=cls.new(uri)
 req['Authorization']="Bearer #{token}";req['Accept']='application/json';req['Content-Type']='application/json'
 req.body=JSON.generate(payload) if payload
 res=Net::HTTP.start(uri.host,uri.port,use_ssl:true,open_timeout:20,read_timeout:35){|h|h.request(req)}
 data=res.body.to_s.empty? ? {} : (JSON.parse(res.body) rescue {})
 unless (200..299).cover?(res.code.to_i)
  msg=Array(data['errors']).map{|e|e['detail']||e['title']}.compact.join('; ')
  abort("Apple API #{method} #{uri.path} HTTP #{res.code}: #{msg[0,300]}")
 end
 data
end
versions=Array(api(:get,"/v1/apps/#{APP_ID}/appStoreVersions?limit=100")['data'])
live=versions.find{|v|v.dig('attributes','versionString')=='4.4.1'}
draft=versions.find{|v|v.dig('attributes','versionString')=='4.4.2'}
abort('Expected existing published 4.4.1 and editable draft 4.4.2') unless live && draft &&
 live.dig('attributes','appStoreState')=='READY_FOR_SALE' &&
 draft.dig('attributes','appStoreState')=='PREPARE_FOR_SUBMISSION'
def russian_locale(version)
 data=Array(api(:get,"/v1/appStoreVersions/#{version.fetch('id')}/appStoreVersionLocalizations?limit=100")['data'])
 data.find{|l| l.dig('attributes','locale')=='ru'} || abort('Russian App Store localization not found')
end
live_locale=russian_locale(live)
draft_locale=russian_locale(draft)
def patch_locale(id,attributes)
 api(:patch,"/v1/appStoreVersionLocalizations/#{id}",{data:{type:'appStoreVersionLocalizations',id:id,attributes:attributes}})
end
patch_locale(live_locale.fetch('id'),{promotionalText:PROMO})
confirmed=api(:get,"/v1/appStoreVersionLocalizations/#{live_locale.fetch('id')}")
abort('Published promotional text not updated') unless confirmed.dig('data','attributes','promotionalText')==PROMO
puts "SUCCESS LIVE 4.4.1 promotional text: #{PROMO}"
patch_locale(draft_locale.fetch('id'),{promotionalText:PROMO,description:DESCRIPTION,keywords:KEYWORDS})
verify=api(:get,"/v1/appStoreVersionLocalizations/#{draft_locale.fetch('id')}")
%w[promotionalText description keywords].each do |field|
 expected={'promotionalText'=>PROMO,'description'=>DESCRIPTION,'keywords'=>KEYWORDS}.fetch(field)
 abort("Draft #{field} update mismatch") unless verify.dig('data','attributes',field)==expected
end
puts "SUCCESS DRAFT 4.4.2 RU keywords (#{KEYWORDS.length} chars): #{KEYWORDS}"
puts "SUCCESS DRAFT 4.4.2 revised description: #{DESCRIPTION.length} chars"
infos=Array(api(:get,"/v1/apps/#{APP_ID}/appInfos?limit=50")['data'])
info=infos.find{|i|i.dig('attributes','appStoreState')=='PREPARE_FOR_SUBMISSION'}
abort('No editable App Info for draft 4.4.2') unless info
info_loc=Array(api(:get,"/v1/appInfos/#{info['id']}/appInfoLocalizations?limit=100")['data'])
ru=info_loc.find{|l|l.dig('attributes','locale')=='ru'} || abort('No RU App Info localization')
id=ru.fetch('id')
api(:patch,"/v1/appInfoLocalizations/#{id}",{data:{type:'appInfoLocalizations',id:id,attributes:{subtitle:SUBTITLE}}})
verify=api(:get,"/v1/appInfoLocalizations/#{id}")
abort('Draft subtitle not saved') unless verify.dig('data','attributes','subtitle')==SUBTITLE
puts "SUCCESS DRAFT 4.4.2 RU subtitle: #{SUBTITLE}"
puts 'Published binary, product screenshots and App Review state unchanged.'
