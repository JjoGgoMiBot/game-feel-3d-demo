# 소리 청취 점검표

귀로 들어 보고 칸에 O/X와 메모를 적는다. 시험 페이지: `game-feel/demo.html`의 "소리 층" 구역(키 선택 → 재생). 같은 키를 5번 눌러 반복감도 본다.

## 합격 기준
- 층이 겹쳐도 찌그러지지(클리핑) 않는다.
- 같은 키 5번: 매번 조금씩 다르게 들리되 같은 소리로 알아본다.
- 약타(power 0.2)와 처치(1.0)의 크기 차이가 분명하다.
- tele는 1.2초에 터지는 순간이 영상(vfx)의 해제 시점과 맞는다.

## 패턴 x 속성
| 키 | 들림 | 메모 |
|---|---|---|
| hit-fire | | |
| hit-ice | | |
| hit-lightning | | |
| hit-poison | | |
| hit-dark | | |
| hit-holy | | |
| hit-arcane | | |
| hit-wind | | |
| hit-metal | | |
| slash-fire | | |
| slash-ice | | |
| slash-lightning | | |
| slash-poison | | |
| slash-dark | | |
| slash-holy | | |
| slash-arcane | | |
| slash-wind | | |
| slash-metal | | |
| stab-fire | | |
| stab-ice | | |
| stab-lightning | | |
| stab-poison | | |
| stab-dark | | |
| stab-holy | | |
| stab-arcane | | |
| stab-wind | | |
| stab-metal | | |
| smash-fire | | |
| smash-ice | | |
| smash-lightning | | |
| smash-poison | | |
| smash-dark | | |
| smash-holy | | |
| smash-arcane | | |
| smash-wind | | |
| smash-metal | | |
| shatter-fire | | |
| shatter-ice | | |
| shatter-lightning | | |
| shatter-poison | | |
| shatter-dark | | |
| shatter-holy | | |
| shatter-arcane | | |
| shatter-wind | | |
| shatter-metal | | |
| aura-fire | | |
| aura-ice | | |
| aura-lightning | | |
| aura-poison | | |
| aura-dark | | |
| aura-holy | | |
| aura-arcane | | |
| aura-wind | | |
| aura-metal | | |
| shot-fire | | |
| shot-ice | | |
| shot-lightning | | |
| shot-poison | | |
| shot-dark | | |
| shot-holy | | |
| shot-arcane | | |
| shot-wind | | |
| shot-metal | | |
| tele-fire | | |
| tele-ice | | |
| tele-lightning | | |
| tele-poison | | |
| tele-dark | | |
| tele-holy | | |
| tele-arcane | | |
| tele-wind | | |
| tele-metal | | |

## 무기 (속성 fire로)
| 키 | 들림 | 메모 |
|---|---|---|
| sword-fire | | |
| axe-fire | | |
| dagger-fire | | |
| spear-fire | | |
| staff-fire | | |
| wand-fire | | |
| bow-fire | | |
| bullet-fire | | |
| grimoire-fire | | |
| throw-fire | | |

## 음원 교체 우선순위(들어 보고 어색한 것부터)
1. 합성이 가장 어색한 층 종류를 고른다(impact/burst/tail/rumble/rise/ring).
2. 실제 음원을 `samples/이름.wav`로 두고 `loadSample(ctx,이름,url)` 후 `CONST.sampleMap["키:종류"]=이름`.
3. 코드 수정 없이 그 층만 바뀐다(README의 "음원 교체" 참고).
