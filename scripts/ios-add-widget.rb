#!/usr/bin/env ruby
# frozen_string_literal: true
#
# ios-add-widget.rb — AnimaWidget(WidgetKit 익스텐션) 타깃을 ios/App/App.xcodeproj 에 주입한다.
#
# 왜 스크립트인가: ios/ 는 gitignore 대상이라 `npx cap add ios` 로 재생성되면 위젯 타깃이 사라진다.
# 소스(ios-templates/AnimaWidget, ios-templates/plugin)만 저장소에 두고, 이 스크립트가 매번
# 멱등하게 타깃을 다시 만든다.
#
# 하는 일:
#   1) 위젯 소스/플러그인을 ios/ 로 복사
#   2) WidgetBridgePlugin.swift 를 App 타깃 컴파일 소스에 추가(App Group 브릿지)
#   3) AnimaWidget app-extension 타깃 생성(소스/Info.plist/entitlements/빌드설정/서명)
#   4) App 타깃에 의존성 + "Embed App Extensions" 복사 페이즈로 위젯 임베드
#
# 멱등성: 기존 AnimaWidget 타깃/그룹/임베드 페이즈/플러그인 참조가 있으면 먼저 제거 후 재생성.
#
# 실행: GEM_HOME="$HOME/.gem" ruby scripts/ios-add-widget.rb  (scripts/ios-add-widget.sh 권장)

require "xcodeproj"
require "fileutils"

# ---- 상수 ----
TEAM_ID = "6Z995494HZ"
APP_BUNDLE_ID = "com.michaelkim.anima"
WIDGET_BUNDLE_ID = "com.michaelkim.anima.widget"
WIDGET_TARGET_NAME = "AnimaWidget"
DEPLOYMENT_TARGET = "16.0" # 잠금화면 accessory 위젯 = iOS 16+
MARKETING_VERSION = "1.0"
PROJECT_VERSION = "2"

repo_root = File.expand_path("..", __dir__)
project_path = File.join(repo_root, "ios/App/App.xcodeproj")
abort("REJECT: #{project_path} 없음 — 먼저 `npx cap add ios` 필요") unless File.directory?(project_path)

ios_app_dir = File.join(repo_root, "ios/App")           # 프로젝트 디렉터리(소스 트리 기준)
widget_dst  = File.join(ios_app_dir, WIDGET_TARGET_NAME) # ios/App/AnimaWidget
app_src_dir = File.join(ios_app_dir, "App")              # ios/App/App

# ---- 1) 소스 복사 ----
FileUtils.mkdir_p(widget_dst)
Dir.glob(File.join(repo_root, "ios-templates/#{WIDGET_TARGET_NAME}", "*")).each do |f|
  FileUtils.cp(f, widget_dst)
end
# 플러그인 Swift 들(WidgetBridge, StoreKitBridge 등)을 App 타깃 소스 디렉터리로 복사.
# 새 플러그인을 추가할 때 이 스크립트를 고칠 필요가 없도록 ios-templates/plugin/*.swift 전체를 훑는다.
plugin_files = Dir.glob(File.join(repo_root, "ios-templates/plugin", "*.swift"))
                  .map { |f| File.basename(f) }
                  .sort
abort("REJECT: ios-templates/plugin 에 .swift 플러그인이 없습니다.") if plugin_files.empty?
plugin_files.each do |name|
  FileUtils.cp(
    File.join(repo_root, "ios-templates/plugin", name),
    File.join(app_src_dir, name),
  )
end
puts "==> 소스 복사 완료: #{widget_dst}, App/{#{plugin_files.join(', ')}}"

project = Xcodeproj::Project.open(project_path)
app_target = project.targets.find { |t| t.name == "App" }
abort("REJECT: 'App' 타깃을 찾지 못함") unless app_target

# ---- 멱등: 기존 위젯 타깃/그룹/임베드/플러그인 참조 정리 ----
project.targets.select { |t| t.name == WIDGET_TARGET_NAME }.each do |t|
  t.product_reference&.remove_from_project
  t.remove_from_project
end
# App 타깃의 위젯 의존성 + 임베드 페이즈 제거
app_target.dependencies.dup.each do |dep|
  dep.remove_from_project if dep.target&.name == WIDGET_TARGET_NAME || dep.display_name == WIDGET_TARGET_NAME
end
app_target.copy_files_build_phases.select { |p| p.name == "Embed App Extensions" }.each(&:remove_from_project)
# 기존 위젯 그룹 제거
if (g = project.main_group[WIDGET_TARGET_NAME])
  g.remove_from_project
end
# 기존 플러그인 컴파일 참조 제거(중복 컴파일 방지) — 모든 플러그인 파일 대상.
app_target.source_build_phase.files.dup.each do |bf|
  ref = bf.file_ref
  next unless ref.respond_to?(:path) && plugin_files.include?(File.basename(ref.path.to_s))
  bf.remove_from_project
end
(project.main_group["App"] || project.main_group).files.dup.each do |fr|
  fr.remove_from_project if fr.respond_to?(:path) && plugin_files.include?(File.basename(fr.path.to_s))
end

# ---- 2) 플러그인 Swift 들을 App 타깃 소스에 추가 ----
app_group = project.main_group["App"] || project.main_group
plugin_refs = plugin_files.map { |name| app_group.new_reference(name) }
app_target.add_file_references(plugin_refs)
puts "==> App 타깃에 플러그인 추가: #{plugin_files.join(', ')}"

# ---- 3) AnimaWidget app-extension 타깃 생성 ----
# Project#new_target(type, name, platform, deployment_target, build_configuration_list=nil, language=:objc)
widget_target = project.new_target(
  :app_extension, WIDGET_TARGET_NAME, :ios, DEPLOYMENT_TARGET, nil, :swift
)

widget_group = project.main_group.new_group(WIDGET_TARGET_NAME, WIDGET_TARGET_NAME)
swift_files = %w[
  AnimaWidgetBundle.swift
  AnimaWidgetModel.swift
  AnimaWidgetProvider.swift
  AnimaWidgetViews.swift
]
swift_refs = swift_files.map { |f| widget_group.new_reference(f) }
widget_target.add_file_references(swift_refs)
# Info.plist / entitlements 는 컴파일 대상이 아니라 참조만(빌드설정에서 경로 지정)
widget_group.new_reference("Info.plist")
widget_group.new_reference("AnimaWidget.entitlements")

widget_target.build_configurations.each do |config|
  bs = config.build_settings
  bs["PRODUCT_BUNDLE_IDENTIFIER"] = WIDGET_BUNDLE_ID
  bs["PRODUCT_NAME"] = "$(TARGET_NAME)"
  bs["INFOPLIST_FILE"] = "#{WIDGET_TARGET_NAME}/Info.plist"
  bs["CODE_SIGN_ENTITLEMENTS"] = "#{WIDGET_TARGET_NAME}/AnimaWidget.entitlements"
  bs["GENERATE_INFOPLIST_FILE"] = "NO"
  bs["IPHONEOS_DEPLOYMENT_TARGET"] = DEPLOYMENT_TARGET
  bs["MARKETING_VERSION"] = MARKETING_VERSION
  bs["CURRENT_PROJECT_VERSION"] = PROJECT_VERSION
  bs["SWIFT_VERSION"] = "5.0"
  bs["TARGETED_DEVICE_FAMILY"] = "1,2"
  bs["SKIP_INSTALL"] = "NO"
  bs["DEVELOPMENT_TEAM"] = TEAM_ID
  # 서명: 기본 Automatic(+빌드 시 -allowProvisioningUpdates). 수동 빌드 시 빌드설정 오버라이드로 대체.
  bs["CODE_SIGN_STYLE"] = "Automatic"
  bs["LD_RUNPATH_SEARCH_PATHS"] = [
    "$(inherited)",
    "@executable_path/Frameworks",
    "@executable_path/../../Frameworks",
  ]
end
puts "==> AnimaWidget 타깃 생성(bundle #{WIDGET_BUNDLE_ID}, iOS #{DEPLOYMENT_TARGET})"

# ---- 4) 임베드: App 타깃 의존성 + Embed App Extensions ----
app_target.add_dependency(widget_target)
embed = app_target.new_copy_files_build_phase("Embed App Extensions")
embed.symbol_dst_subfolder_spec = :plug_ins
bf = embed.add_file_reference(widget_target.product_reference, true)
bf.settings = { "ATTRIBUTES" => ["RemoveHeadersOnCopy"] }
puts "==> App 타깃에 위젯 임베드(Embed App Extensions → PlugIns)"

project.save
puts "✅ 저장 완료: #{project_path}"
