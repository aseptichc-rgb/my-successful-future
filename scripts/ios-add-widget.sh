#!/usr/bin/env bash
#
# ios-add-widget.sh — AnimaWidget(WidgetKit) 익스텐션 타깃을 ios/App/App.xcodeproj 에 주입.
#
# ios/ 는 gitignore 라 `npx cap add ios` 재생성 시 위젯 타깃이 사라진다. 소스는
# ios-templates/AnimaWidget · ios-templates/plugin 에 두고, 이 스크립트가 멱등하게 재주입한다.
#
# 사전: gem install --user-install xcodeproj  (1회)
# 실행: bash scripts/ios-add-widget.sh
#
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# 사용자 gem 경로 자동 탐지 — xcodeproj 가 설치된 곳을 GEM_HOME 에 넣는다.
if [[ -z "${GEM_HOME:-}" ]]; then
  export GEM_HOME="$HOME/.gem"
fi

if ! ruby -e "require 'xcodeproj'" >/dev/null 2>&1; then
  echo "REJECT: ruby 'xcodeproj' gem 을 찾을 수 없습니다." >&2
  echo "        먼저 설치하세요: gem install --user-install xcodeproj" >&2
  exit 1
fi

ruby "${PROJECT_DIR}/scripts/ios-add-widget.rb"
