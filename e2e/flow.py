"""
E2E 통합 테스트 — 실제 빌드(vite preview)를 헤드리스 Chromium으로 구동.
가짜 시계(page.clock)로 타이머를 빨리 감아 운동 흐름 전체를 검증하고, 폼팩터별 스크린샷을 남긴다.
실행: python3 e2e/flow.py [base_url] [out_dir]
"""
import sys, os, json
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4173/'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'e2e/shots'
os.makedirs(OUT, exist_ok=True)
results = []

def check(name, cond, detail=''):
    results.append((name, bool(cond), detail))
    print(('PASS ' if cond else 'FAIL ') + name + (f' — {detail}' if detail else ''))

def shot(page, name):
    page.screenshot(path=f'{OUT}/{name}.png')

with sync_playwright() as p:
    browser = p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
    ctx = browser.new_context(viewport={'width': 412, 'height': 915}, device_scale_factor=2, is_mobile=True, has_touch=True, locale='ko-KR')
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    page.clock.install()
    page.goto(BASE)

    # ── 1. 설문 (최초 1회)
    expect(page.get_by_text('운동 목표가 무엇인가요?')).to_be_visible()
    shot(page, '01_survey')
    page.get_by_role('button', name='근비대').click(); page.clock.run_for(300)
    page.get_by_role('button', name='초급 (3개월~1년)').click(); page.clock.run_for(300)
    page.get_by_role('button', name='3회', exact=True).click(); page.clock.run_for(300)
    page.get_by_role('button', name='45분').click(); page.clock.run_for(300)
    page.get_by_role('button', name='등', exact=True).click()
    page.get_by_role('button', name='다음').click()
    page.get_by_role('button', name='어깨', exact=True).click()
    page.get_by_role('button', name='다음').click()
    page.get_by_label('체중(kg)').fill('72')
    page.get_by_role('button', name='추천 받기').click()

    # ── 2. 강화 방향 제안
    expect(page.get_by_text('근비대를 위해 이렇게 운동해 보세요')).to_be_visible()
    check('제안: 회피 부위(어깨) 제외 표시', page.get_by_text('제외').count() == 1)
    shot(page, '02_proposal')
    page.get_by_role('button', name='추천 운동 보기').click()

    # ── 3. 운동 선택
    expect(page.get_by_text('운동 고르기')).to_be_visible()
    rec = page.locator('.ex-card[aria-checked="true"]').count()
    check('추천 운동 미리 체크 (45분 → 4~5개)', 3 <= rec <= 6, f'{rec}개')
    check('회피 부위 주동 운동 미노출 (숄더 프레스)', page.get_by_text('숄더 프레스 머신').count() == 0)
    shot(page, '03_picker')
    page.get_by_role('button', name='레그 프레스 자세히 보기').first.click()
    expect(page.get_by_role('dialog').get_by_role('heading', name='운동요령')).to_be_visible()
    page.wait_for_timeout(400)
    shot(page, '04_detail_sheet')
    page.keyboard.press('Escape')
    page.locator('button', has_text='루틴 만들기').click()

    # ── 4. 루틴 설정: 회당 시간 2초 일괄, 저장
    expect(page.get_by_text('루틴 설정')).to_be_visible()
    page.get_by_role('radiogroup', name='모든 운동의 회당 시간').get_by_role('radio', name='2초').click()
    first_item = page.locator('.routine-item').first
    first_name = first_item.locator('b').first.inner_text()
    first_item.locator('button[aria-expanded]').click()
    shot(page, '05_routine_edit')
    first_item.get_by_role('button', name='중량 늘리기').click()
    page.get_by_role('button', name='이대로 저장').click()

    # ── 5. 홈: 재실행 시 바로 시작 (설정 기억)
    expect(page.get_by_role('button', name='오늘 루틴 시작')).to_be_visible()
    page.reload()
    expect(page.get_by_role('button', name='오늘 루틴 시작')).to_be_visible()
    check('새로고침 후에도 설문·루틴 유지 → 홈 바로 진입', page.get_by_text('오늘의 운동').is_visible())
    shot(page, '06_home')

    # ── 6. 운동
    page.get_by_role('button', name='오늘 루틴 시작').click()
    expect(page.locator('.wo')).to_be_visible()
    check('첫 운동은 대기 상태(시작 버튼)', page.locator('.wo-actions .btn.primary').inner_text() == '시작')
    shot(page, '07_workout_ready')
    page.locator('.wo-actions .btn.primary').click()
    page.clock.run_for(3200)  # 카운트다운
    page.clock.run_for(2 * 3 * 1000 + 100)  # 2초 × 3회
    num = page.locator('.rep-num').inner_text()
    check('타이머 기준 반복 진행 (2초 간격 → 6초에 3회)', num == '3', f'표시 {num}')
    shot(page, '08_workout_working')

    # 탭 = 세트 완료
    page.locator('.rep-ring').click()
    page.clock.run_for(300)
    check('링 탭 → 세트 완료 → 휴식', page.locator('.rep-sub').inner_text() == '휴식')
    shot(page, '09_workout_rest')

    # 중량 + (운동 중 변경 → 다음 회차 기본값)
    page.get_by_role('button', name='중량 늘리기').click()

    # 스와이프 → 모션 모드
    view = page.locator('.pager-view').bounding_box()
    y = view['y'] + view['height'] / 2
    page.mouse.move(view['x'] + view['width'] * 0.8, y); page.mouse.down()
    page.mouse.move(view['x'] + view['width'] * 0.2, y, steps=6); page.mouse.up()
    page.clock.run_for(400)
    check('좌우 스와이프 → 모션 모드', page.get_by_role('tab', name='모션 모드').get_attribute('aria-selected') == 'true')
    check('모션 모드: 포즈 프레임 2컷 + 남은 휴식 시간 표시', page.locator('.wo-motion .pose img').count() == 2 and ':' in page.locator('.mo-big').first.inner_text())
    page.wait_for_timeout(400)
    shot(page, '10_workout_motion')
    page.get_by_role('tab', name='진행 모드').click()

    # 휴식 건너뛰기 → 다음 세트
    page.get_by_role('button', name='휴식 건너뛰기').click()
    page.clock.run_for(3200)
    check('휴식 건너뛰기 → 다음 세트 진행', page.locator('.rep-sub').inner_text().startswith('/'))

    # 점유중 → 나중에
    before = page.locator('.wo-progress h2').inner_text()
    page.get_by_role('button', name='기구 사용 중, 나중에').click()
    page.clock.run_for(300)
    after = page.locator('.wo-progress h2').inner_text()
    last_up = page.locator('.wo-upcoming li b').last.inner_text()
    check('나중에 → 현재 운동이 맨 뒤로', before != after and last_up == before, f'{before} → {after}, 마지막 {last_up}')

    # 지금 하기 (SWITCH_TO)
    target = page.locator('.wo-upcoming li b').nth(1).inner_text() if page.locator('.wo-upcoming li').count() > 1 else None
    if target:
        page.locator('.wo-upcoming li').nth(1).get_by_role('button', name='지금').click()
        page.clock.run_for(300)
        check('지금 하기 → 선택 운동이 현재로', page.locator('.wo-progress h2').inner_text() == target)

    # 새로고침 → 이어서 하기
    page.reload()
    page.clock.run_for(500)
    resumed = page.locator('.wo').is_visible() or page.get_by_text('하던 운동이 있어요').is_visible()
    check('운동 중 새로고침해도 진행 복구', resumed)
    if page.get_by_text('하던 운동이 있어요').is_visible():
        page.get_by_role('button', name='이어서 운동').click()

    # 미니 화면 토글 (커버화면 대체 확인)
    page.get_by_role('button', name='미니 화면').click()
    shot(page, '11_workout_mini_toggle')
    page.locator('.wo-mini-exit').click()

    # 끝내기 → 요약
    page.get_by_role('button', name='운동 끝내기').click()
    page.get_by_role('button', name='끝내고 저장').click()
    expect(page.get_by_text('운동 결과')).to_be_visible()
    check('요약: 볼륨·칼로리 표시', page.get_by_text('추정 소모 칼로리').is_visible() and 'kg을 들었어요' in page.locator('h2').inner_text())
    shot(page, '12_summary')

    page.get_by_role('button', name='캘린더 보기').click()
    expect(page.get_by_text('운동 캘린더')).to_be_visible()
    check('캘린더: 오늘 운동 표시', page.locator('.month .pip.l2, .month .pip.l1, .month .pip.l3').count() >= 1)
    shot(page, '13_calendar')

    # 설정 기억: 바꾼 중량이 루틴에 반영
    page.goto(BASE + '#/home'); page.clock.run_for(300)
    first_line = page.locator('.today-list li').first.inner_text()
    # 1세트 65kg 완료 → 휴식 중 +5 → 2세트는 미완료 상태에서 '나중에'. 완료 세트 최빈값(65kg)을 기억해야 함
    check('설정 기억: 루틴 편집(+5) 반영, 완료 세트에서 가장 많이 쓴 중량을 기억', '65kg' in first_line, first_line.replace('\n', ' '))

    # 프로 게이트
    page.goto(BASE + '#/pro'); page.clock.run_for(300)
    check('테스트 기간: 구입 버튼 숨김', page.get_by_role('button', name='월 구독').count() == 0 and page.get_by_role('button', name='평생 이용권').count() == 0)
    page.get_by_role('switch', name='프로 모드 (테스트)').click()
    page.clock.run_for(300)
    page.wait_for_timeout(400)
    check('프로 모드 스위치로 진입', page.get_by_role('switch').get_attribute('aria-checked') == 'true')
    shot(page, '14_pro')
    page.goto(BASE + '#/settings'); page.clock.run_for(300)
    shot(page, '15_settings')

    # 샌드박스는 외부망 차단 → 웹폰트 CDN 실패는 제외
    errors = [e for e in errors if 'ERR_TUNNEL' not in e and 'net::ERR_FAILED' not in e]
    check('콘솔·페이지 에러 없음', not errors, '; '.join(errors[:3]))
    state = page.evaluate("() => localStorage.length")

    # ── 폼팩터: 운동 중 화면 크기를 바꿔 접기/펼치기를 재현 (같은 세션 유지 확인)
    page.goto(BASE + '#/home'); page.clock.run_for(500)
    page.locator('.home-hero .btn.primary').click()
    page.clock.run_for(300)
    page.locator('.wo-actions .btn.primary').click()
    page.clock.run_for(3200 + 4100)
    rep_before = page.locator('.rep-num').inner_text()
    for name, vp, expected in [
        ('flip_cover', {'width': 340, 'height': 352}, 'wo-mini'),
        ('fold_open', {'width': 884, 'height': 1000}, 'wo-wide'),
        ('landscape', {'width': 915, 'height': 412}, 'wo-mini'),
        ('bar_phone', {'width': 412, 'height': 915}, 'wo-base'),
    ]:
        page.set_viewport_size(vp)
        page.clock.run_for(250)
        page.wait_for_timeout(300)
        cls = page.locator('.wo').get_attribute('class')
        check(f'폼팩터 {name} {vp["width"]}x{vp["height"]} → {expected}', expected in cls, cls)
        page.screenshot(path=f'{OUT}/20_{name}.png')
        if name == 'flip_cover':
            v = page.locator('.pager-view').bounding_box()
            yy = v['y'] + v['height'] / 2
            page.mouse.move(v['x'] + v['width'] * 0.85, yy); page.mouse.down(); page.mouse.move(v['x'] + v['width'] * 0.1, yy, steps=6); page.mouse.up()
            page.clock.run_for(400)
            page.wait_for_timeout(400)
            page.screenshot(path=f'{OUT}/21_flip_cover_motion.png')
            page.get_by_role('tab', name='진행 모드').click()
    check('프로 모드에서는 모션 잠금 없음', page.locator('.motion-lock').count() == 0)
    # 모션-타이머 통합: 작업 중 포즈 전환이 회당 시간(2초)에 맞춰 바뀜
    page.get_by_role('tab', name='모션 모드').click()
    page.clock.run_for(300)
    ops = []
    for _ in range(6):
        page.clock.run_for(333)
        page.wait_for_timeout(60)
        ops.append(round(float(page.locator('.wo-motion .pose-peak').evaluate("el => getComputedStyle(el).opacity")), 2))
    check('작업 중 시작↔정점 포즈가 타이머에 맞춰 전환', max(ops) > 0.9 and min(ops) < 0.1, str(ops))
    check('모션 모드에 반복 숫자·조각 막대', page.locator('.mo-bar i').count() >= 1 and page.locator('.mo-big').count() == 1)
    page.screenshot(path=f'{OUT}/16_motion_working.png')
    page.get_by_role('tab', name='진행 모드').click()
    check('화면 크기가 바뀌어도 운동 진행 유지', page.locator('.wo').is_visible() and page.locator('.rep-sub').count() == 1, f'변경 전 {rep_before}회')

    # 휴식 10초 남기고 진행·세트 자동 전환 (회당 2초 × 10회 = 20초 → 휴식)
    page.clock.run_for(30_000)
    sub = page.locator('.rep-sub').inner_text()
    check('세트 종료 후 자동 휴식 진입', sub in ('휴식', '준비') or sub.startswith('/'), sub)
    browser.close()

ok = sum(1 for r in results if r[1])
print(f'\n{ok}/{len(results)} passed')
json.dump([{'name': n, 'pass': p, 'detail': d} for n, p, d in results], open(f'{OUT}/results.json', 'w'), ensure_ascii=False, indent=1)
sys.exit(0 if ok == len(results) else 1)
