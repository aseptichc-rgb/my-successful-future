/**
 * "잘한 일" 초안 저장 판정 단위 테스트.
 *
 * 회귀 방지 배경: 잘한 일은 디바운스 자동 저장만 있고 flush 경로가 없어, 마지막 글자를 치고
 * 곧바로 홈 버튼을 누르면 타이머가 돌기 전에 페이지가 얼어 기록이 통째로 유실될 수 있었다.
 * 위젯 진척도가 늦게 따라오던 것도 같은 뿌리다. flush 를 추가하면서 "저장을 걸어야 하는가"
 * 판정이 타이핑 경로와 flush 경로 두 곳에 생기므로, 판정 자체를 한 곳으로 모아 고정한다.
 */
import { describe, expect, it } from "vitest";
import { shouldSaveWins, winsSnapshotKey } from "@/lib/winsDraft";

describe("shouldSaveWins", () => {
  it("바뀐 내용이 있고 비어있지 않으면 저장한다", () => {
    expect(shouldSaveWins(["운동함", "", ""], ["", "", ""])).toBe(true);
  });

  it("저장본과 같으면 저장하지 않는다", () => {
    expect(shouldSaveWins(["운동함", "", ""], ["운동함", "", ""])).toBe(false);
  });

  it("전부 비었으면 저장하지 않는다 — 빈 값으로 기존 기록을 덮지 않는다", () => {
    expect(shouldSaveWins(["", "", ""], ["", "", ""])).toBe(false);
    expect(shouldSaveWins(["   ", ""], ["", ""])).toBe(false);
  });

  it("한 칸이라도 내용이 남아 있으면 삭제도 저장 대상이다", () => {
    expect(shouldSaveWins(["운동함", "", ""], ["운동함", "독서", ""])).toBe(true);
  });

  it("길이가 달라도(옛 문서) 안전하게 비교한다", () => {
    expect(shouldSaveWins(["운동함", "", ""], [])).toBe(true);
    expect(shouldSaveWins(["운동함", "독서"], ["운동함"])).toBe(true);
    // 저장본이 더 길고 지금이 그 앞부분과 같으면 뒤 칸을 지운 것 — 내용이 남아 있으므로 저장.
    expect(shouldSaveWins(["운동함"], ["운동함", "독서"])).toBe(true);
  });

  it("전부 지워 저장본을 비우는 것은 저장하지 않는다 — 내용이 남아야 쓴다", () => {
    // 마지막 한 줄까지 지운 상태. 빈 배열을 쓰는 건 자동 저장이 할 일이 아니다.
    expect(shouldSaveWins(["", "", ""], ["운동함", "", ""])).toBe(false);
  });
});

describe("winsSnapshotKey", () => {
  it("같은 내용이면 같은 키 — 중복 저장을 걸러낸다", () => {
    expect(winsSnapshotKey(["a", "b"])).toBe(winsSnapshotKey(["a", "b"]));
  });

  it("내용이 다르면 다른 키", () => {
    expect(winsSnapshotKey(["a", "b"])).not.toBe(winsSnapshotKey(["a", "c"]));
  });

  it("칸 위치가 다르면 다른 키 — 순서도 기록의 일부다", () => {
    expect(winsSnapshotKey(["a", ""])).not.toBe(winsSnapshotKey(["", "a"]));
  });
});
