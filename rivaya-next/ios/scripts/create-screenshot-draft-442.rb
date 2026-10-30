#!/usr/bin/env ruby
# Create a DRAFT release for replacing RIVAYA product-page screenshots.
# Does not submit a build or alter the already-published 4.4.1 version.
require 'json'
require 'uri'
require 'openssl'
require 'base64'
require 'net/http'
require 'jwt'
APP_ID='6823716293'
KEY=OpenSSL::PKey::EC.new(Base64.strict_decode64(ENV.fetch('ASC_KEY_P8_BASE64').delete("\r\n")))
def asc(method,path,payload=nil)
  uri=URI("https://api.appstoreconnect.apple.com#{path}")
  now=Time.now.to_i
  token=JWT.encode({iss:ENV.fetch('ASC_ISSUER_ID'),iat:now-15,exp:now+800,aud:'appstoreconnect-v1'},KEY,'ES256',{kid:ENV.fetch('ASC_KEY_ID'),typ:'JWT'})
  req=case method;when :post then Net::HTTP::Post.new(uri);else Net::HTTP::Get.new(uri);end
  req['Authorization']="Bearer #{token}";req['Content-Type']='application/json';req['Accept']='application/json'
  req.body=JSON.generate(payload) if payload
  res=Net::HTTP.start(uri.host,uri.port,use_ssl:true,read_timeout:35,open_timeout:15){|h|h.request(req)}
  body=res.body.to_s.empty? ? {} : (JSON.parse(res.body) rescue {})
  unless (200..299).include?(res.code.to_i)
    err=Array(body['errors']).map{|v|v['detail']||v['title']}.compact.join('; ')
    abort("App Store Connect HTTP #{res.code}: #{err[0,350]}")
  end
  body
end
versions=Array(asc(:get,"/v1/apps/#{APP_ID}/appStoreVersions?#{URI.encode_www_form([['filter[platform]','IOS'],['limit','100']])}")['data'])
current=versions.find{|v|v.dig('attributes','versionString')=='4.4.1'}
abort('Do not change any release: 4.4.1 is not READY_FOR_SALE') unless current&.dig('attributes','appStoreState')=='READY_FOR_SALE'
draft=versions.find{|v|v.dig('attributes','versionString')=='4.4.2'}
if draft
 abort("Unexpected 4.4.2 state #{draft.dig('attributes','appStoreState')}") unless draft.dig('attributes','appStoreState')=='PREPARE_FOR_SUBMISSION'
 puts "Existing draft 4.4.2 id=#{draft['id']}"
else
 payload={data:{type:'appStoreVersions',attributes:{platform:'IOS',versionString:'4.4.2',releaseType:'AFTER_APPROVAL'},
   relationships:{app:{data:{type:'apps',id:APP_ID}}}}}
 draft=asc(:post,'/v1/appStoreVersions',payload).fetch('data')
 puts "CREATED DRAFT 4.4.2 for new screenshots only, id=#{draft['id']}"
end
id=draft.fetch('id')
loc=Array(asc(:get,"/v1/appStoreVersions/#{id}/appStoreVersionLocalizations?limit=100")['data'])
puts "Localizations: #{loc.map{|l|l.dig('attributes','locale')}.join(', ')}"
puts "PUBLISHED 4.4.1 unchanged; no submission or binary upload performed."
