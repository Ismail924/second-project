# Verify both screenshot sizes and remove only obsolete PPO-only review, enabling full RIVAYA 4.5 submission.
require 'net/http'
require 'uri'
require 'json'
require 'jwt'
require 'openssl'
require 'base64'
APP='6823716293'
DRAFT='4.5.0'
OLD_SUB='d3930f5b-3069-46c2-9dda-824148ec5a90'
OLD_PPO='74638c9c-1695-4a46-8667-cadb324ca7ef'
KEY=OpenSSL::PKey::EC.new(Base64.strict_decode64(ENV.fetch('ASC_KEY_P8_BASE64').delete("\r\n")))
def api(method,path,body=nil)
  now=Time.now.to_i
  tok=JWT.encode({iss:ENV.fetch('ASC_ISSUER_ID'),iat:now-10,exp:now+850,aud:'appstoreconnect-v1'},KEY,'ES256',{kid:ENV.fetch('ASC_KEY_ID'),typ:'JWT'})
  uri=URI("https://api.appstoreconnect.apple.com#{path}")
  req=(method==:get ? Net::HTTP::Get : Net::HTTP::Patch).new(uri)
  req['Authorization']="Bearer #{tok}"
  req['Content-Type']='application/json'
  req.body=JSON.generate(body) if body
  res=Net::HTTP.start(uri.host,uri.port,use_ssl:true,open_timeout:20,read_timeout:45){|h|h.request(req)}
  data=JSON.parse(res.body.to_s.empty? ? '{}' : res.body) rescue {}
  unless res.code.to_i.between?(200,299)
    reason=Array(data['errors']).map{|x|x['detail']||x['title']}.join('; ')
    abort("Apple API #{method} #{uri.path} HTTP #{res.code}: #{reason[0,240]}")
  end
  data
end
versions=Array(api(:get,"/v1/apps/#{APP}/appStoreVersions?limit=100")['data'])
draft=versions.find{|v|v.dig('attributes','versionString')==DRAFT}
abort('4.5 draft unavailable or not editable') unless draft&.dig('attributes','appStoreState')=='PREPARE_FOR_SUBMISSION'
locs=Array(api(:get,"/v1/appStoreVersions/#{draft['id']}/appStoreVersionLocalizations?limit=100")['data'])
ru=locs.find{|l|l.dig('attributes','locale').to_s.downcase.start_with?('ru')}
abort('Russian localization missing') unless ru
sets=Array(api(:get,"/v1/appStoreVersionLocalizations/#{ru['id']}/appScreenshotSets?limit=100")['data'])
%w[APP_IPHONE_67 APP_IPHONE_61].each do |type|
  set=sets.find{|x|x.dig('attributes','screenshotDisplayType')==type}
  abort("Missing screenshot set #{type}") unless set
  screens=Array(api(:get,"/v1/appScreenshotSets/#{set['id']}/appScreenshots?limit=100")['data'])
  names=screens.map{|s|s.dig('attributes','fileName')}.sort
  expected=%w[01_today.png 02_plan.png 03_progress.png 04_profile.png].sort
  abort("Unsafe screenshot inventory #{type}: #{names}") unless names==expected
  abort("Apple has not completed #{type} screenshot processing") unless screens.all?{|s|s.dig('attributes','assetDeliveryState','state')=='COMPLETE'}
  puts "Verified 4 new screenshots for #{type}, zero old screenshots"
end
sub=api(:get,"/v1/reviewSubmissions/#{OLD_SUB}").fetch('data')
state=sub.dig('attributes','state')
if %w[CANCELING COMPLETE].include?(state)
  puts "Old PPO submission already inactive: #{state}"
elsif %w[WAITING_FOR_REVIEW IN_REVIEW].include?(state)
  items=Array(api(:get,"/v1/reviewSubmissions/#{OLD_SUB}/items?limit=100&include=appStoreVersionExperimentV2")['data'])
  abort('Refusing to cancel any app version review or unrelated item') unless items.length==1 && items[0].dig('relationships','appStoreVersionExperimentV2','data','id')==OLD_PPO
  api(:patch,"/v1/reviewSubmissions/#{OLD_SUB}",{data:{type:'reviewSubmissions',id:OLD_SUB,attributes:{canceled:true}}})
  puts 'Canceled obsolete screenshot-only PPO submission, NOT the published app version'
else
  abort("Unexpected prior review state #{state}")
end
25.times do
  new_state=api(:get,"/v1/reviewSubmissions/#{OLD_SUB}").dig('data','attributes','state')
  if new_state=='COMPLETE'
    puts 'Old PPO submission canceled and completed. RIVAYA 4.5 is ready for review submission.'
    exit 0
  end
  sleep 12
end
abort('Apple has not completed the old PPO cancellation')
