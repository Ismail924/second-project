require 'net/http'
require 'uri'
require 'json'
require 'jwt'
require 'openssl'
require 'base64'
APP='6823716293'
KEY=OpenSSL::PKey::EC.new(Base64.strict_decode64(ENV.fetch('ASC_KEY_P8_BASE64').delete("\r\n")))
def api(path)
  now=Time.now.to_i
  token=JWT.encode({iss:ENV.fetch('ASC_ISSUER_ID'),iat:now-10,exp:now+850,aud:'appstoreconnect-v1'},KEY,'ES256',{kid:ENV.fetch('ASC_KEY_ID'),typ:'JWT'})
  uri=URI("https://api.appstoreconnect.apple.com#{path}")
  req=Net::HTTP::Get.new(uri);req['Authorization']="Bearer #{token}"
  res=Net::HTTP.start(uri.host,uri.port,use_ssl:true,open_timeout:20,read_timeout:40){|h|h.request(req)}
  abort("HTTP #{res.code} #{uri.path} #{res.body.to_s[0,280]}") unless res.code.to_i.between?(200,299)
  JSON.parse(res.body)
end
versions=Array(api("/v1/apps/#{APP}/appStoreVersions?limit=100")['data'])
versions.each do |v|
 puts "VERSION #{v.dig('attributes','versionString')} #{v.dig('attributes','appStoreState')} id=#{v['id']}"
 next unless ['4.4.1','4.5.0'].include?(v.dig('attributes','versionString'))
 locales=Array(api("/v1/appStoreVersions/#{v['id']}/appStoreVersionLocalizations?limit=100")['data'])
 locales.each do |l|
  sets=Array(api("/v1/appStoreVersionLocalizations/#{l['id']}/appScreenshotSets?limit=100")['data'])
  sets.each do |s|
   screens=Array(api("/v1/appScreenshotSets/#{s['id']}/appScreenshots?limit=100")['data'])
   puts "SCREENSET version=#{v.dig('attributes','versionString')} locale=#{l.dig('attributes','locale')} type=#{s.dig('attributes','screenshotDisplayType')} screens=#{screens.map{|x|[x.dig('attributes','fileName'),x.dig('attributes','assetDeliveryState','state')]}.inspect}"
  end
 end
end
submissions=Array(api("/v1/apps/#{APP}/reviewSubmissions?limit=100")['data'])
submissions.each do |s|
 state=s.dig('attributes','state')
 next unless ['READY_FOR_REVIEW','WAITING_FOR_REVIEW','IN_REVIEW','UNRESOLVED_ISSUES'].include?(state)
 items=Array(api("/v1/reviewSubmissions/#{s['id']}/items?limit=100")['data'])
 puts "REVIEW #{s['id']} state=#{state} items=#{items.map{|i|[i['type'],i.dig('attributes','state'),i['relationships'].keys]}.inspect}"
end
exps=Array(api("/v1/apps/#{APP}/appStoreVersionExperimentsV2?limit=100")['data'])
exps.each {|e| puts "PPO #{e['id']} #{e.dig('attributes','name')} #{e.dig('attributes','state')}"}
