#!/usr/bin/env ruby
# Idempotently register only the missing extension Bundle ID. Existing app untouched.
require 'openssl'
require 'base64'
require 'json'
require 'net/http'
require 'uri'
require 'jwt'
key=OpenSSL::PKey::EC.new(Base64.strict_decode64(ENV.fetch('ASC_KEY_P8_BASE64').delete("\r\n")))
token=JWT.encode({iss:ENV.fetch('ASC_ISSUER_ID'),iat:Time.now.to_i-10,exp:Time.now.to_i+300,aud:'appstoreconnect-v1'},
  key,'ES256',{kid:ENV.fetch('ASC_KEY_ID'),typ:'JWT'})
def api(token,method,path,body=nil)
  uri=URI("https://api.appstoreconnect.apple.com#{path}")
  request=(method==:post ? Net::HTTP::Post : Net::HTTP::Get).new(uri)
  request['Authorization']="Bearer #{token}"
  request['Content-Type']='application/json'
  request.body=JSON.generate(body) if body
  response=Net::HTTP.start(uri.host,uri.port,use_ssl:true,open_timeout:20,read_timeout:35){|http| http.request(request)}
  parsed=JSON.parse(response.body) rescue {}
  unless (200..299).cover?(response.code.to_i)
    reason=Array(parsed['errors']).map{|x| x['detail']||x['title']}.compact.join('; ')
    abort("Apple Developer bundle registration failed: HTTP #{response.code} #{reason[0,220]}")
  end
  parsed
end
identifier='app.rivaya.smart01.widgets'
existing=api(token,:get,"/v1/bundleIds?#{URI.encode_www_form([['filter[identifier]',identifier],['limit',10]])}")
if (entry=Array(existing['data']).find{|x|x.dig('attributes','identifier')==identifier})
  puts "WidgetKit App ID already registered: #{identifier} (#{entry['id']})"
else
  body={data:{type:'bundleIds',attributes:{identifier:identifier,name:'RIVAYA Widgets',platform:'IOS'}}}
  created=api(token,:post,'/v1/bundleIds',body)
  puts "Registered WidgetKit App ID: #{identifier} (#{created.dig('data','id')})"
end
