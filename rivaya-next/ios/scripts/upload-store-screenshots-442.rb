#!/usr/bin/env ruby
# Upload authentic screenshots captured from the current RIVAYA UI into
# DRAFT App Store 4.4.2. This does not change live 4.4.1, submit a new
# binary, or send the draft for review.
require 'json'
require 'net/http'
require 'uri'
require 'openssl'
require 'base64'
require 'jwt'
require 'digest'
APP_ID='6823716293'
FOLDER=File.expand_path('../../../appstore-shots-442',__dir__)
KEY=OpenSSL::PKey::EC.new(Base64.strict_decode64(ENV.fetch('ASC_KEY_P8_BASE64').delete("\r\n")))
def asc(method,path,body=nil)
  uri=URI("https://api.appstoreconnect.apple.com#{path}")
  now=Time.now.to_i
  jwt=JWT.encode({iss:ENV.fetch('ASC_ISSUER_ID'),iat:now-15,exp:now+800,aud:'appstoreconnect-v1'},KEY,'ES256',{kid:ENV.fetch('ASC_KEY_ID'),typ:'JWT'})
  cls={get:Net::HTTP::Get,post:Net::HTTP::Post,patch:Net::HTTP::Patch,delete:Net::HTTP::Delete}.fetch(method)
  req=cls.new(uri)
  req['Authorization']="Bearer #{jwt}";req['Accept']='application/json';req['Content-Type']='application/json'
  req.body=JSON.generate(body) if body
  res=Net::HTTP.start(uri.host,uri.port,use_ssl:true,open_timeout:20,read_timeout:45){|h|h.request(req)}
  data=res.body.to_s.empty? ? {} : (JSON.parse(res.body) rescue {})
  unless (200..299).include?(res.code.to_i)
    msg=Array(data['errors']).map{|e|e['detail']||e['title']}.compact.join('; ')
    abort("Apple HTTP #{res.code} on #{method} #{uri.path}: #{msg[0,350]}")
  end
  data
end
def upload_parts(ops,raw)
  Array(ops).each do |op|
    part=raw.byteslice(op.fetch('offset'),op.fetch('length'))
    abort('Screenshot upload byte range mismatch') unless part && part.bytesize==op.fetch('length')
    target=URI(op.fetch('url'))
    abort('Invalid Apple upload URL') unless target.scheme=='https'
    response=nil
    3.times do |attempt|
      req=Net::HTTP::Put.new(target)
      Array(op['requestHeaders']).each{|h| req[h.fetch('name')]=h.fetch('value')}
      req.body=part
      response=Net::HTTP.start(target.host,target.port,use_ssl:true,open_timeout:25,read_timeout:100){|h|h.request(req)}
      break if (200..299).include?(response.code.to_i)
      sleep 3*(attempt+1)
    end
    abort("Apple upload chunk HTTP #{response.code}") unless (200..299).include?(response.code.to_i)
  end
end
version=Array(asc(:get,"/v1/apps/#{APP_ID}/appStoreVersions?#{URI.encode_www_form([['filter[platform]','IOS'],['limit','100']])}")['data'])
release=version.find{|v|v.dig('attributes','versionString')=='4.4.1'}
abort('Released 4.4.1 missing') unless release&.dig('attributes','appStoreState')=='READY_FOR_SALE'
draft=version.find{|v|v.dig('attributes','versionString')=='4.4.2'}
abort('Draft 4.4.2 missing') unless draft
abort('4.4.2 is not editable') unless draft.dig('attributes','appStoreState')=='PREPARE_FOR_SUBMISSION'
locs=Array(asc(:get,"/v1/appStoreVersions/#{draft.fetch('id')}/appStoreVersionLocalizations?limit=100")['data'])
locale=locs.find{|l|l.dig('attributes','locale').to_s.downcase.start_with?('ru')} || locs.first
abort('No App Store localization for screenshots') unless locale
loc_id=locale.fetch('id')
puts "RIVAYA 4.4.2 DRAFT: locale #{locale.dig('attributes','locale')}"
items=Array(asc(:get,"/v1/appStoreVersionLocalizations/#{loc_id}/appScreenshotSets?limit=100")['data'])
set=items.find{|s|s.dig('attributes','screenshotDisplayType')=='APP_IPHONE_67'}
unless set
  create={data:{type:'appScreenshotSets',attributes:{screenshotDisplayType:'APP_IPHONE_67'},
    relationships:{appStoreVersionLocalization:{data:{type:'appStoreVersionLocalizations',id:loc_id}}}}}
  set=asc(:post,'/v1/appScreenshotSets',create).fetch('data')
  puts "Created screenshot set APP_IPHONE_67"
end
set_id=set.fetch('id')
previous=Array(asc(:get,"/v1/appScreenshotSets/#{set_id}/appScreenshots?limit=100")['data'])
valid_names=%w[01_today.png 02_plan.png 03_progress.png 04_profile.png]
abort("Existing screenshot set has #{previous.size} assets; too many for safe replacement") if previous.size>6
ids=[]
valid_names.each do |name|
  file=File.join(FOLDER,name)
  abort("Generated authentic screenshot not found: #{file}") unless File.file?(file)
  bytes=File.binread(file)
  abort("Invalid PNG screenshot #{name}") unless bytes.start_with?("\x89PNG\r\n\x1a\n".b)
  dimensions=bytes.byteslice(16,8).unpack('N2')
  abort("Invalid iPhone 16 Pro Max screenshot dimensions #{name}: #{dimensions.join('x')}") unless dimensions==[1320,2868]
  digest=Digest::MD5.hexdigest(bytes)
  matching=previous.find{|x|x.dig('attributes','fileName')==name &&
     x.dig('attributes','sourceFileChecksum')==digest &&
     x.dig('attributes','assetDeliveryState','state')=='COMPLETE'}
  if matching
    puts "Already verified screenshot #{name}"
    ids << matching.fetch('id')
    next
  end
  reservation={data:{type:'appScreenshots',attributes:{fileName:name,fileSize:bytes.bytesize},
    relationships:{appScreenshotSet:{data:{type:'appScreenshotSets',id:set_id}}}}}
  rec=asc(:post,'/v1/appScreenshots',reservation).fetch('data')
  id=rec.fetch('id')
  upload_parts(rec.dig('attributes','uploadOperations'),bytes)
  commit={data:{type:'appScreenshots',id:id,attributes:{uploaded:true,sourceFileChecksum:digest}}}
  asc(:patch,"/v1/appScreenshots/#{id}",commit)
  puts "Committed #{name} to Apple App Store Connect"
  24.times do
    curr=asc(:get,"/v1/appScreenshots/#{id}")
    state=curr.dig('data','attributes','assetDeliveryState','state')
    if state=='COMPLETE'
      puts "APPLE VERIFIED #{name}: COMPLETE"
      break
    end
    abort("Screenshot failed Apple processing: #{name}: #{curr.dig('data','attributes','assetDeliveryState')}") if state=='FAILED'
    sleep 5
  end
  final=asc(:get,"/v1/appScreenshots/#{id}").dig('data','attributes','assetDeliveryState','state')
  abort("Screenshot #{name} not confirmed processed: #{final}") unless final=='COMPLETE'
  ids<<id
end
# Don't delete any old draft screenshots until all four new assets are COMPLETE.
remaining=previous.reject{|v|ids.include?(v.fetch('id'))}
remaining.each do |item|
  asc(:delete,"/v1/appScreenshots/#{item.fetch('id')}")
  puts "Removed outdated screenshot from 4.4.2 draft: #{item.dig('attributes','fileName')}"
end
count=Array(asc(:get,"/v1/appScreenshotSets/#{set_id}/appScreenshots?limit=100")['data'])
abort("Screenshot count mismatch: #{count.length}") unless count.size==4
puts "SUCCESS: 4 authentic, full-resolution App Store screenshots uploaded and processed for DRAFT 4.4.2."
puts 'Published 4.4.1 remains unchanged, no review submission performed.'
