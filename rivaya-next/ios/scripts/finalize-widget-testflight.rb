#!/usr/bin/env ruby
# Verify the already-uploaded 4.3.1 (41017) build and grant existing internal testers access.
# No IPA upload, no new build number and no public release are performed here.
require 'json'
require 'net/http'
require 'uri'
require 'openssl'
require 'base64'
require 'jwt'

APP_ID = '6823716293'
VERSION = '4.4.0'
BUILD_NUMBER = ENV.fetch('RIVAYA_BUILD_NUMBER')
INTERNAL_GROUP_ID = '2c4000e6-c4e6-4fe7-8126-46dc4f106e58'

def api(method, path, payload = nil)
  uri = URI("https://api.appstoreconnect.apple.com#{path}")
  body = {
    iss: ENV.fetch('ASC_ISSUER_ID'),
    iat: Time.now.to_i - 15,
    exp: Time.now.to_i + 900,
    aud: 'appstoreconnect-v1'
  }
  key = OpenSSL::PKey::EC.new(Base64.strict_decode64(ENV.fetch('ASC_KEY_P8_BASE64').delete("\r\n")))
  token = JWT.encode(body, key, 'ES256', { kid: ENV.fetch('ASC_KEY_ID'), typ: 'JWT' })
  request = (method == :get ? Net::HTTP::Get : Net::HTTP::Post).new(uri)
  request['Authorization'] = "Bearer #{token}"
  request['Accept'] = 'application/json'
  request['Content-Type'] = 'application/json'
  request.body = JSON.generate(payload) if payload
  response = Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 20, read_timeout: 35) { |http| http.request(request) }
  parsed = response.body.to_s.empty? ? {} : (JSON.parse(response.body) rescue {})
  [response.code.to_i, parsed]
end

def require_ok!(code, data, description)
  return if (200..299).cover?(code)
  reason = Array(data['errors']).map { |e| e['detail'] || e['title'] }.compact.join('; ')
  abort("#{description}: HTTP #{code} #{reason[0, 300]}")
end

def group_build_ids
  code, res = api(:get, "/v1/betaGroups/#{INTERNAL_GROUP_ID}/relationships/builds?limit=200")
  require_ok!(code, res, 'Check existing internal group membership')
  Array(res['data']).map { |item| item['id'] }
end

group_code, group = api(:get, "/v1/betaGroups/#{INTERNAL_GROUP_ID}")
require_ok!(group_code, group, 'Find personal internal testing group')
g = group.fetch('data').fetch('attributes')
abort('Wrong beta group kind') unless g['isInternalGroup'] == true
linked_app = group.dig('data', 'relationships', 'app', 'data', 'id')
abort('Internal group is not for RIVAYA') if linked_app && linked_app != APP_ID

params = URI.encode_www_form([['filter[app]', APP_ID], ['filter[version]', BUILD_NUMBER], ['include','preReleaseVersion'], ['limit','50']])
build = nil
deadline = Time.now + 1200
loop do
  list_code, list = api(:get, "/v1/builds?#{params}")
  require_ok!(list_code, list, 'Find exact TestFlight build')
  candidates = Array(list['data']).select { |item| item.dig('attributes','version').to_s == BUILD_NUMBER }
  candidates.each do |candidate|
    id = candidate.fetch('id')
    detail_code, detail = api(:get, "/v1/builds/#{id}?include=preReleaseVersion")
    next unless detail_code == 200
    release = Array(detail['included']).find { |record| record['type'] == 'preReleaseVersions' }
    next unless release && release.dig('attributes','version') == VERSION
    build = detail.fetch('data')
    break
  end
  if build
    state = build.dig('attributes', 'processingState')
    abort("Apple rejected RIVAYA build #{BUILD_NUMBER}: #{state}") if %w[FAILED INVALID].include?(state)
    break if state == 'VALID'
  end
  abort("Apple processing of RIVAYA #{VERSION} (#{BUILD_NUMBER}) is still pending; group assignment is unconfirmed.") if Time.now > deadline
  puts 'Waiting for Apple to index and process WidgetKit build...'
  sleep 30
end
build_id = build.fetch('id')
puts "Apple confirms RIVAYA #{VERSION} build #{BUILD_NUMBER}, processing VALID."

# Apple's build-read API may report VALID before the internal-beta-group write
# API can resolve that build. Retry the exact build ID without uploading again.
unless group_build_ids.include?(build_id)
  endpoints = [
    ["/v1/betaGroups/#{INTERNAL_GROUP_ID}/relationships/builds", { data: [{ type: 'builds', id: build_id }] }],
    ["/v1/builds/#{build_id}/relationships/betaGroups", { data: [{ type: 'betaGroups', id: INTERNAL_GROUP_ID }] }]
  ]
  deadline = Time.now + 1050
  linked = false
  attempts = 0
  until linked || Time.now >= deadline
    attempts += 1
    endpoints.each do |path, body|
      code, result = api(:post, path, body)
      if (200..299).cover?(code)
        linked = true
        break
      end
      if [404, 409, 422].include?(code)
        message = Array(result['errors']).map { |e| e['detail'] || e['title'] }.compact.join('; ')
        puts "Apple group association attempt #{attempts}: HTTP #{code} #{message[0,120]}"
      else
        require_ok!(code, result, 'Associate TestFlight build with internal testers')
      end
      if group_build_ids.include?(build_id)
        linked = true
        break
      end
    end
    break if linked
    sleep 30
  end
  abort('Apple processing finished, but internal TestFlight group association is still unavailable; no public submission was attempted.') unless linked
end

12.times do
  if group_build_ids.include?(build_id)
    puts "SUCCESS: RIVAYA #{VERSION} (#{BUILD_NUMBER}) is available to the personal internal TestFlight group."
    exit 0
  end
  sleep 15
end
abort('Apple group assignment has not propagated; build remains uploaded but TestFlight access is unconfirmed.')
