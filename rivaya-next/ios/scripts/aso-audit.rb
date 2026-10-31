#!/usr/bin/env ruby
require 'openssl'
require 'base64'
require 'json'
require 'net/http'
require 'uri'
require 'jwt'
APP='6823716293'
def api(path)
 uri=URI("https://api.appstoreconnect.apple.com#{path}")
 now=Time.now.to_i
 key=OpenSSL::PKey::EC.new(Base64.strict_decode64(ENV.fetch('ASC_KEY_P8_BASE64').delete("\r\n")))
 jwt=JWT.encode({iss:ENV.fetch('ASC_ISSUER_ID'),iat:now-10,exp:now+750,aud:'appstoreconnect-v1'},key,'ES256',{kid:ENV.fetch('ASC_KEY_ID'),typ:'JWT'})
 req=Net::HTTP::Get.new(uri)
 req['Authorization']="Bearer #{jwt}"
 res=Net::HTTP.start(uri.host,uri.port,use_ssl:true,open_timeout:20,read_timeout:35){|h|h.request(req)}
 b=JSON.parse(res.body) rescue {}
 unless res.code.to_i==200
  puts "API #{uri.path} HTTP #{res.code}: #{Array(b['errors']).map{|e|e['detail']}.join('; ')[0,300]}"
  return {}
 end
 b
end
versions=Array(api("/v1/apps/#{APP}/appStoreVersions?limit=100")['data'])
versions.select{|v|%w[4.4.1 4.4.2].include?(v.dig('attributes','versionString'))}.each do |v|
  puts "VERSION: #{v.dig('attributes','versionString')}, state: #{v.dig('attributes','appStoreState')}, id: #{v['id']}"
  loc=Array(api("/v1/appStoreVersions/#{v['id']}/appStoreVersionLocalizations?limit=100")['data'])
  loc.each do |l|
    a=l['attributes'];puts "LOCALIZATION: #{a['locale']}, id: #{l['id']}"
    %w[description keywords promotionalText whatsNew supportUrl marketingUrl].each{|k|puts "  #{k}: #{a[k].to_s[0,1800]}"}
    sets=Array(api("/v1/appStoreVersionLocalizations/#{l['id']}/appScreenshotSets?limit=100")['data'])
    sets.each{|s|puts "  screenshot set: #{s['id']}, kind: #{s.dig('attributes','screenshotDisplayType')}"}
  end
  experiments=api("/v2/appStoreVersions/#{v['id']}/appStoreVersionExperiments?limit=10")
  puts "EXPERIMENTS: #{Array(experiments['data']).map{|e|"#{e['id']}:#{e.dig('attributes','state')}"}.join(', ')}"
end
infos=Array(api("/v1/apps/#{APP}/appInfos?limit=30")['data'])
infos.each do |i|
  puts "APPINFO #{i['id']} state: #{i.dig('attributes','appStoreState')}"
  Array(api("/v1/appInfos/#{i['id']}/appInfoLocalizations?limit=100")['data']).each do |l|
    a=l['attributes'];puts "INFO locale=#{a['locale']}, id=#{l['id']}, name=#{a['name']}, subtitle=#{a['subtitle']}, privacyPolicyUrl=#{a['privacyPolicyUrl']}"
  end
end
