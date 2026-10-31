// cards.js — 카드 데이터(CARD_POOL). 브라우저·Node(서버) 공용.
// 카드를 추가/수정할 때는 이 파일만 고친다. (효과 로직은 engine.js 의 EFFECTS 쪽)
const CARD_POOL = [
  {type:'minion', name:"들쥐", cost:1, rarity:'일반', atk:1, hp:2},
  {type:'minion', name:"책벌레", cost:1, rarity:'일반', atk:1, hp:1, effect:{type:'draw', value:1}},
  {type:'minion', name:"은빛 신병", cost:1, rarity:'일반', atk:1, hp:1, shield:true},
  {type:'minion', name:"돌담 견습병", cost:1, rarity:'일반', atk:1, hp:3, taunt:true},
  {type:'minion', name:"견습 검사", cost:2, rarity:'일반', atk:2, hp:2},
  {type:'minion', name:"방패병", cost:2, rarity:'일반', atk:1, hp:4},
  {type:'minion', name:"약초꾼", cost:2, rarity:'일반', atk:1, hp:3, effect:{type:'heal', value:3}},
  {type:'minion', name:"훈련 교관", cost:2, rarity:'일반', atk:2, hp:1, effect:{type:'buff', value:1}},
  {type:'minion', name:"빛나는 파수병", cost:2, rarity:'일반', atk:1, hp:4, taunt:true},
  {type:'minion', name:"매의 눈 궁수", cost:2, rarity:'일반', atk:2, hp:1, effect:{type:'damage', value:1}},
  {type:'minion', name:"숲 늑대", cost:3, rarity:'일반', atk:3, hp:3},
  {type:'minion', name:"화염 정령", cost:3, rarity:'일반', atk:4, hp:2, effect:{type:'damage', value:2}},
  {type:'minion', name:"부족의 주술사", cost:3, rarity:'일반', atk:2, hp:3, effect:{type:'buff', value:1}},
  {type:'minion', name:"수정 골렘", cost:3, rarity:'일반', atk:2, hp:4, shield:true},
  {type:'minion', name:"강철 파수대장", cost:3, rarity:'일반', atk:2, hp:5, taunt:true},
  {type:'minion', name:"떠돌이 치유사", cost:3, rarity:'일반', atk:2, hp:2, effect:{type:'heal', value:4}},
  {type:'minion', name:"돌 골렘", cost:4, rarity:'일반', atk:3, hp:6},
  {type:'minion', name:"용병대장", cost:4, rarity:'희귀', atk:4, hp:4, effect:{type:'draw', value:1}},
  {type:'minion', name:"대지 정령", cost:4, rarity:'일반', atk:4, hp:6, taunt:true},
  {type:'minion', name:"빛의 수호자", cost:4, rarity:'일반', atk:3, hp:4, shield:true},
  {type:'minion', name:"불사조", cost:4, rarity:'희귀', atk:3, hp:3, charge:true, revive:true},
  {type:'minion', name:"늙은 사자", cost:5, rarity:'일반', atk:5, hp:5},
  {type:'minion', name:"벼락 마법사", cost:5, rarity:'희귀', atk:4, hp:4, effect:{type:'damage', value:4}},
  {type:'minion', name:"시간의 마법사", cost:5, rarity:'희귀', atk:2, hp:3, effect:{type:'gainMana', value:3}},
  {type:'minion', name:"서리 거인", cost:6, rarity:'희귀', atk:6, hp:7},
  {type:'minion', name:"폭풍 부르는 자", cost:6, rarity:'희귀', atk:5, hp:5, effect:{type:'damage', value:5}},
  {type:'minion', name:"심판관", cost:6, rarity:'희귀', atk:4, hp:5, effect:{type:'sweep', value:3}},
  {type:'minion', name:"고대 용", cost:7, rarity:'희귀', atk:8, hp:8, effect:{type:'buff', value:2}},
  {type:'minion', name:"고대의 수호룡", cost:7, rarity:'특급', atk:6, hp:9, taunt:true, shield:true},
  {type:'minion', name:"날쌘 척후병", cost:2, rarity:'일반', atk:1, hp:3, rush:true},
  {type:'minion', name:"대마법학자 롬메스", cost:9, rarity:'전설', atk:5, hp:7, effect:{type:'recastLog'}},   // v56: 시작 덱에 없던 주문 중 내가 손패에서 낸 것을 낸 횟수만큼 다시 시전
  {type:'minion', name:"주문 직조사", cost:4, rarity:'희귀', atk:3, hp:5, effect:{type:'seedDeck', value:10}},                      // v57: 무작위 주문 10장을 내 덱에 섞어 넣는다 (이름은 임의로 정함)
  {type:'minion', name:"회귀의 사서", cost:3, rarity:'일반', atk:2, hp:2, effect:{type:'recycle', value:3, draw:3}},               // v57: 손패를 덱에 섞고, 덱 전체 비용 -3, 카드 3장 뽑기 (이름은 임의로 정함. 능력치 2/2 는 '22>' 를 그렇게 읽음)
  {type:'minion', name:"유물 수집가", cost:2, rarity:'일반', atk:3, hp:2, deathCopy:true},                                      // v58: 죽음의 메아리 — 내 손패에서 비용이 가장 높은 주문 1장을 복사 (이름은 임의로 정함)
  {type:'minion', name:"성소의 수습사제", cost:2, rarity:'일반', atk:1, hp:4, effect:{type:'healHoly', value:3}},                 // v58: 전투의 함성 — 대상 체력 3 회복(v59: 약초꾼처럼 대상을 직접 선택), 무작위 신성 주문 1장을 손패로 (이름은 임의로 정함)
  {type:'minion', name:"명암의 사도", cost:3, rarity:'일반', atk:3, hp:4, deathGain:true},                                       // v59: 죽음의 메아리 — 무작위 암흑 주문 1장과 무작위 신성 주문 1장을 손패로 (이름은 임의로 정함)
  {type:'minion', name:"분열하는 점액", cost:1, rarity:'일반', atk:2, hp:2, onAttackCopy:true},                                  // v59: 이 하수인이 공격할 때마다 복사본(모든 강화 유지)을 비용 1로 손패에 (이름은 임의로 정함)
  {type:'minion', name:"요그사론", cost:10, rarity:'전설', atk:7, hp:7, effect:{type:'yogg'}},                 // v56: 내가 손패에서 낸 주문 수만큼 무작위 주문 시전 (비용·능력치는 임의로 정함)
  {type:'spell', name:"대마법 보호막", cost:3, rarity:'일반', runes:{unholy:1}, school:['암흑'], effect:{type:'massElusive', value:1}},
  {type:'spell', name:"탈란지의 최후의 저항", cost:5, rarity:'희귀', runes:{unholy:2}, effect:{type:'massDeathSummonCost', value:4}},
  {type:'spell', name:"냉혹한 겨울", cost:4, rarity:'일반', runes:{frost:1}, school:['냉기'], effect:{type:'enemySweepDraw', value:2}},
  // ---- 주문: 전장에 남지 않고 효과만 쓰고 사라진다. 수치는 잠정치 — selfPlay 로 재 가며 조정할 것 ----
  {type:'spell', name:"치유의 빛",   cost:1, rarity:'일반', school:['신성'], effect:{type:'heal', value:5}},
  {type:'spell', name:"침묵",        cost:1, rarity:'일반', school:['신성'], effect:{type:'silence'}},
  {type:'spell', name:"불꽃 화살",   cost:2, rarity:'일반', school:['화염'], effect:{type:'damage', value:3}},
  {type:'spell', name:"지식의 서",   cost:2, rarity:'일반', school:['비전'], effect:{type:'draw', value:2}},
  {type:'spell', name:"수호의 장벽", cost:2, rarity:'일반', school:['신성'], effect:{type:'giveShield'}},
  {type:'spell', name:"급습",       cost:2, rarity:'일반', effect:{type:'haste'}},
  {type:'spell', name:"처형",       cost:3, rarity:'일반', school:['암흑'], effect:{type:'execute', value:5}},
  {type:'spell', name:"불의 비",    cost:4, rarity:'일반', school:['화염'], effect:{type:'rain', value:2}},
  {type:'spell', name:"첫 번째 불꽃", cost:1, rarity:'일반', school:['화염'], effect:{type:'firstFlame', value:2}},
  {type:'spell', name:"매서운 한파", cost:1, rarity:'일반', school:['냉기'], effect:{type:'frostbite'}},
  {type:'spell', name:"눈보라", cost:6, rarity:'희귀', school:['냉기'], effect:{type:'blizzard', value:2}},
  {type:'spell', name:"냉기 돌풍", cost:3, rarity:'일반', school:['냉기'], effect:{type:'coldFront', value:1}},
  {type:'spell', name:"신비술사의 고서", cost:4, rarity:'희귀', school:['비전'], effect:{type:'arcaneTome'}},
  {type:'spell', name:"주머니 차원", cost:4, rarity:'희귀', school:['비전'], effect:{type:'pocketDimension'}},
  {type:'spell', name:"주문술사의 흐름", cost:4, rarity:'희귀', school:['비전'], effect:{type:'spellFlow'}},
  {type:'spell', name:"비전 수호자", cost:8, rarity:'특급', school:['비전'], effect:{type:'arcaneGuardian'}},
  {type:'spell', name:"서리",       cost:2, rarity:'일반', school:['냉기'], effect:{type:'freeze'}},
  {type:'spell', name:"복제",       cost:2, rarity:'일반', school:['비전'], effect:{type:'copy'}},
  {type:'spell', name:"강화",       cost:2, rarity:'일반', school:['비전'], effect:{type:'enhance', value:2}},
  {type:'spell', name:"회수",       cost:2, rarity:'일반', school:['비전'], effect:{type:'recall'}},
  {type:'spell', name:"변이",       cost:3, rarity:'일반', school:['비전'], effect:{type:'transform'}},
  {type:'spell', name:"번개",       cost:1, rarity:'일반', school:['자연'], effect:{type:'bolt', value:2}},
  {type:'spell', name:"화염구",     cost:4, rarity:'희귀', school:['화염'], effect:{type:'damage', value:6}},
  {type:'spell', name:"대폭발",     cost:6, rarity:'희귀', school:['비전'], effect:{type:'wipe', value:6}},
  {type:'spell', name:"주문 발견",  cost:1, rarity:'일반', school:['비전'], effect:{type:'discover', value:1}},   // value = 비용 할인
  {type:'spell', name:"피의 서약",  cost:2, rarity:'희귀', school:['암흑'], lifeCost:true, effect:{type:'discover', min:5, value:2}},   // lifeCost: 마나 대신 생명력으로 지불 / min·max: 발견할 주문의 비용 범위
  {type:'spell', name:"불꽃 점괘",  cost:3, rarity:'일반', school:['화염'], effect:{type:'damageDiscover', value:2, max:3}},
  {type:'spell', name:"사냥개 떼",  cost:4, rarity:'희귀', school:['자연'], effect:{type:'summon', count:3, atk:3, hp:1, token:'질주 사냥개'}},   // 속공 3/1 세 마리 소환 (이름은 임의로 정함)
  {type:'spell', name:"철벽 소집", cost:6, rarity:'특급', school:['신성'], effect:{type:'muster', total:6}},                                      // v26: 비용 합 6이 되도록 하수인 무작위 소환 + 도발 (이름은 임의로 정함)
  {type:'spell', name:"혼돈의 주문서", cost:10, rarity:'특급', school:['지옥'], effect:{type:'chaos', value:10}},                                  // v26: 무작위 주문 10회 사용 (이름은 임의로 정함)
  {type:'spell', name:"고대의 축복", cost:3, rarity:'희귀', school:['자연'], twin:true, effect:{type:'massEnhance', value:1}},                    // v42: 이중 주문 — 모든 아군 하수인 +1/+1
  {type:'spell', name:"숲의 지원군", cost:8, rarity:'특급', school:['자연'], twin:true, effect:{type:'summon', count:5, atk:2, hp:2, token:'나무정령', rush:false}},   // v28: 이중 주문 — 2/2 나무정령 5기 소환 (속공 아님)
  {type:'spell', name:"일식",       cost:2, rarity:'일반', school:['자연'], effect:{type:'eclipse'}},                                                         // v28: 이번 턴에 시전하는 다음 주문을 2번 시전
  {type:'spell', name:"금단의 과일", cost:0, rarity:'일반', school:['자연'], effect:{type:'fruit'}},                                                   // v29: 마나를 모두 소모. 선택 — 아군 하수인 1기 이번 턴 공격력 +소모한 마나 / 방어도 +2배
  {type:'spell', name:"번개 개화",   cost:0, rarity:'일반', school:['자연'], overload:2, effect:{type:'bloom', value:2}},                                   // v29: 이번 턴 마나 +2 (동전처럼 얻는다) / 과부하 (2)
  {type:'spell', name:"생물학 프로젝트", cost:1, rarity:'일반', school:['자연'], effect:{type:'growth', value:2}},                                         // v29: 각 플레이어 마나 수정 +2
  {type:'spell', name:"대지의 비늘", cost:2, rarity:'일반', school:['자연'], effect:{type:'scale', value:1}},                                         // v32: 아군 하수인 +1/+1, 그 하수인의 공격력만큼 방어도
  {type:'spell', name:"급속 성장",   cost:2, rarity:'일반', school:['자연'], effect:{type:'crystal', value:1}},                                       // v32: 빈 마나 수정 1개 (최대 마나만 +1)
  {type:'spell', name:"등산용 간식", cost:2, rarity:'일반', school:['자연'], effect:{type:'snack', value:2}},                                         // v32: 다음 턴에만 마나 +2
  {type:'spell', name:"키틴질 껍질", cost:2, rarity:'일반', school:['자연'], effect:{type:'carapace', value:4}},                                     // v32: 방어도 +4, 내 다음 턴 시작에 +4 더 (속성은 말씀에 없어 자연으로 정함)
  {type:'spell', name:"퇴비 만들기", cost:2, rarity:'일반', school:['자연'], effect:{type:'compost', value:1}},                                       // v32: 내 하수인 전체에 죽음의 메아리: 카드 1장 뽑기
  {type:'spell', name:"새로운 경지", cost:3, rarity:'일반', school:['자연'], effect:{type:'ascend', value:3}},                                       // v35: 최대 마나 +3 (10 초과 가능) 후 빈 마나 수정 1개 (10 상한). 속성은 말씀에 없어 자연으로 정함
  {type:'spell', name:"숲의 영혼",   cost:3, rarity:'일반', school:['자연'], effect:{type:'forestSoul', value:1}},                                   // v35: 내 하수인 전체에 죽음의 메아리: 2/2 나무정령 소환
  {type:'spell', name:"야생의 포효", cost:3, rarity:'일반', school:['자연'], effect:{type:'roar', value:2}},                                         // v35: 이번 턴 내 하수인 전체 공격력 +2 (영웅은 공격하지 않으므로 하수인만). 속성은 자연으로 정함
  {type:'spell', name:"휘둘러치기", cost:3, rarity:'일반', school:['자연'], effect:{type:'cleave', value:4, other:1}},                               // v38: 적 하나에 피해 4, 다른 모든 적에게 피해 1 (속성은 자연으로 정함)
  {type:'spell', name:"줄이기",     cost:3, rarity:'일반', school:['자연'], effect:{type:'shrink', value:1}},                                       // v38: 내 덱의 하수인들 비용·공격력 -1 (최소 0)
  {type:'spell', name:"흉포한 울음소리", cost:3, rarity:'일반', school:['자연'], effect:{type:'furyCry', value:1}},                                  // v38: 카드 1장 뽑고, 손패 1장당 방어도 +1 (속성은 자연으로 정함)
  {type:'spell', name:"대지의 수호", cost:5, rarity:'희귀', school:['자연'], effect:{type:'guardian', armor:5, cost:5}},                              // v38: 방어도 5 + 비용 5 하수인 무작위 소환·도발
  {type:'spell', name:"덱 탐색",     cost:2, rarity:'일반', school:['비전'], effect:{type:'deckDiscover', value:2}},                                 // v40: 내 덱에서 서로 다른 카드 최대 3장 중 1장을 복사하여 발견, 비용 -2 (이름·속성은 임의로 정함)
  {type:'spell', name:"공중활강",   cost:7, rarity:'특급', school:['자연'], effect:{type:'glide', atk:1, hp:1, token:'활강병'}},
  {type:'spell', name:"육성", cost:5, rarity:'희귀', school:['자연'], effect:{type:'choice', options:[{name:'마나 수정 2개', effect:{type:'choiceMana', value:2}},{name:'카드 3장 뽑기', effect:{type:'draw', value:3}}]}},
  {type:'spell', name:"딱정벌레술", cost:5, rarity:'희귀', effect:{type:'choice', options:[{name:'방어도 +12', effect:{type:'choiceArmor', value:12}},{name:'도발 딱정벌레 둘 소환', effect:{type:'summon', count:2, atk:3, hp:3, token:'딱정벌레', taunt:true, rush:false}}]}},
  {type:'spell', name:"숨겨진 오아시스", cost:6, rarity:'특급', school:['자연'], effect:{type:'choice', options:[{name:'도발 6/6 고대정령 소환', effect:{type:'summon', count:1, atk:6, hp:6, token:'고대정령', taunt:true, rush:false}},{name:'생명력 12 회복', effect:{type:'choiceHeal', value:12}}]}},                    // 속공 1/1 로 전장을 가득 채움. 이번 턴에 모두 죽으면 같은 수만큼 다시 소환
  {type:'spell', name:"영원의 불화살", cost:3, rarity:'일반', school:['화염'], effect:{type:'eternalBolt', value:3}},                       // v61: 생명력 흡수. 하수인에게 피해 3, 그 하수인이 죽으면 내 턴 종료 시 이 주문을 손패로 되돌림
  {type:'spell', name:"아달의 수호자", cost:2, rarity:'일반', school:['신성'], effect:{type:'adalGuardian', atk:2, hp:1, draw:1}},          // v61: 하수인 +2/+1, 카드 1장 뽑기
  {type:'spell', name:"시간대 수선", cost:3, rarity:'일반', school:['신성'], effect:{type:'timeMend', count:2, discount:3}},                 // v61: 무작위 신성 주문 2장 → 그 비용 합만큼 영웅 회복 → 그 주문들 비용 -3
  {type:'spell', name:"가시가 돋친 탈것", cost:5, rarity:'희귀', school:['신성'], effect:{type:'thornMount', atk:2, hp:6}},                       // v61: 하수인 +2/+6·도발, 죽으면 스테고돈(도발 2/6) 소환 (v62: 신성)
  {type:'spell', name:"분파", cost:4, rarity:'일반', school:['암흑'], effect:{type:'splitCopy', atk:2, hp:3}},                       // v62: 아군 하수인 +2/+3·모면, 그 하수인을 복사하여 소환
  {type:'spell', name:"저지해라!", cost:4, rarity:'희귀', school:['신성'], effect:{type:'holdLine', atk:5, hp:5}},                     // v62: 하수인 +5/+5·생명력 흡수
  {type:'spell', name:"아마라의 이야기", cost:10, rarity:'특급', school:['신성'], effect:{type:'amaraTale', value:40}},                              // v62: 내 영웅의 생명력을 40으로 (신성)
  {type:'spell', name:"데자뷔", cost:1, rarity:'일반', school:['암흑'], effect:{type:'handDiscover', value:1}},                                       // v62: 상대 손패에서 3장 중 1장을 복사하여 발견, 비용 -1 (암흑)
  {type:'spell', name:"번개 폭풍", cost:3, rarity:'희귀', school:['자연'], overload:1, effect:{type:'rain', value:3}},               // v63: 모든 적 하수인에게 피해 3 / 과부하 (1)
  {type:'spell', name:"뒤틀린 황천", cost:8, rarity:'특급', school:['암흑'], effect:{type:'destroyAll'}},                              // v63: 모든 하수인 파괴
  {type:'spell', name:"일거리가 있다던데", cost:1, rarity:'일반', effect:{type:'tauntDiscover', atk:1, hp:2}},                         // v63: 도발 하수인 발견 + 그 하수인에 +1/+2 (무속성)
  {type:'spell', name:"물 공급지", cost:8, rarity:'특급', effect:{type:'resurrect', count:3}},                                         // v63: 비용이 가장 높은 내 서로 다른 죽은 도발 하수인 3기 부활 (무속성)
  {type:'spell', name:"적자생존", cost:10, rarity:'특급', effect:{type:'survival', atk:4, hp:4}},                                      // v64: 내 손·덱·전장의 모든 하수인 +4/+4 (무속성)
  {type:'spell', name:"야생의 선물", cost:8, rarity:'특급', school:['자연'], effect:{type:'wildGift', atk:2, hp:2}},                    // v64: 내 하수인들 +2/+2·도발
  {type:'spell', name:"궁극의 역병", cost:10, rarity:'특급', effect:{type:'ultPlague', value:5, draw:5, armor:5, atk:5, hp:5}},         // v64: 피해 5, 5장 뽑기, 방어도 5, 5/5 구울 소환 (무속성)
  {type:'spell', name:"퍼져나가는 역병", cost:6, rarity:'특급', school:['자연'], effect:{type:'spreadPlague', atk:1, hp:5}},                // v65: 도발 1/5 딱정벌레 소환, 상대 하수인이 더 많으면 한 번 더
  {type:'spell', name:"톨비르 대적", cost:3, rarity:'일반', effect:{type:'replayOne'}},                                                   // v65: 이번 게임에서 낸 비용 1 카드 하나를 다시 냄 (무속성)
  {type:'minion', name:"신비한 양초맨", cost:2, rarity:'희귀', atk:3, hp:2, lifesteal:true, school:['비전'], effect:{type:'scatter', value:3}},   // v65: 전투의 함성 — 모든 적에게 피해 3을 무작위로 나눔 (생명력 흡수 적용)
  {type:'spell', name:"되감기", cost:2, rarity:'일반', school:['비전'], effect:{type:'rewind', value:2}},                                  // v65: 이번 게임에 내가 시전한 다른 주문을 발견·복사, 비용 -2
  {type:'spell', name:"극한 반복", cost:2, rarity:'전설', effect:{type:'loopDiscover', value:2}},                          // v66: 주문 발견(비용 -2), 내 턴이 끝나면 이 카드를 손패로 되돌림 (무속성)
  {type:'spell', name:"박학다식", cost:2, rarity:'희귀', effect:{type:'learned', max:3, count:2, swap:true}},             // v66: 비용 3 이하 주문을 둘 발견, 그 두 주문의 비용을 서로 바꿈 (v67 수정)
  {type:'spell', name:"마나 흡수", cost:2, rarity:'일반', school:['비전'], effect:{type:'manaDrain', value:2}},               // v66: 피해 2, 이 피해로 하수인이 죽으면 내 손의 모든 주문 비용 -1
  {type:'spell', name:"열광의 덱", cost:2, rarity:'전설', effect:{type:'frenzyDeck', value:3}},                            // v66: 내 덱의 주문을 비용 +3 높은 주문으로 변신 (실제 비용 유지) (무속성)
  {type:'spell', name:"점화", cost:2, rarity:'일반', school:['화염'], effect:{type:'ignite', value:2}},                                     // v68: 피해 2, 피해가 1 더 큰 점화를 내 덱에 섞어 넣음 (섞인 점화도 같은 효과로 계속 커짐)
  {type:'spell', name:"얼음 회오리", cost:3, rarity:'일반', school:['냉기'], effect:{type:'iceTornado'}},                                   // v68: 모든 적 하수인 빙결
  {type:'spell', name:"초신성", cost:5, rarity:'희귀', school:['화염'], effect:{type:'supernova', cost:1}},                                  // v68: 손을 무작위 화염 주문으로 가득 채움, 그 주문들의 비용 1
  {type:'spell', name:"은하계 투영 구슬", cost:10, rarity:'전설', school:['비전'], effect:{type:'galaxyOrb'}},                  // v68: 이번 게임에 시전한 각 비용의 무작위 주문을 다시 시전 (가능하면 적을 대상으로)
  {type:'spell', name:"왕의 축복", cost:4, rarity:'희귀', school:['신성'], effect:{type:'grantBuff', atk:4, hp:4}},                          // v70: 하수인 +4/+4
  {type:'spell', name:"망자 되살리기", cost:1, rarity:'일반', school:['암흑'], effect:{type:'raiseDead', max:3}},                            // v70: 비용 3 이하 죽은 아군 하수인 1기 부활
  {type:'spell', name:"방부 의식", cost:1, rarity:'일반', effect:{type:'grantBuff', atk:0, hp:0, revive:true}},                           // v70: 하수인에게 환생 (무속성)
  {type:'spell', name:"유령 출몰", cost:3, rarity:'일반', school:['암흑'], effect:{type:'grantBuff', atk:2, hp:3, revive:true, taunt:true}},   // v70: 하수인 +2/+3, 환생·도발
  {type:'spell', name:"빛폭탄", cost:6, rarity:'희귀', school:['신성'], effect:{type:'lightBomb'}},                                     // v71: 모든 하수인이 자신의 공격력만큼 피해
  {type:'spell', name:"영혼의 절규", cost:7, rarity:'특급', school:['암흑'], effect:{type:'soulScream'}},                              // v71: 모든 하수인을 상대편의 덱에 섞어 넣음
  {type:'spell', name:"패거리", cost:2, rarity:'일반', effect:{type:'gang', count:3}},                                                // v71: 하수인 하나를 셋 복사하여 내 덱에 섞어 넣음 (무속성)
  {type:'spell', name:"소멸", cost:6, rarity:'희귀', effect:{type:'vanishAll'}},                                                      // v72: 모든 하수인을 주인의 손으로 (무속성)
  {type:'spell', name:"파괴의 정기", cost:3, rarity:'희귀', school:['자연'], overload:2, effect:{type:'essence', min:4, max:5}},          // v72: 모든 하수인에게 피해 4~5 (하수인마다 따로 무작위) / 과부하 (2)
  {type:'spell', name:"선조의 부름", cost:4, rarity:'희귀', effect:{type:'ancestors'}},                                                 // v72: 각 플레이어 손의 무작위 하수인 소환 (무속성)
  {type:'spell', name:"용의자 줄 세우기", cost:8, rarity:'특급', overload:2, effect:{type:'lineUp', count:3}},                          // v72: 아군 하수인을 셋 복사하여 소환 / 과부하 (2) (무속성)
  // ---- v74 ----
  {type:'spell', name:"방패 올리기", cost:2, rarity:'일반', effect:{type:'raiseShield', armor:5, draw:1}},
  {type:'spell', name:"태양샘", cost:9, rarity:'전설', school:['신성'], dynCost:true, effect:{type:'sunwell'}},
  {type:'minion', name:"교도소 마나스톰", cost:4, atk:5, hp:5, rarity:'전설', effect:{type:'manastorm'}},
  {type:'minion', name:"대마법사 안토니다스", cost:6, atk:5, hp:7, rarity:'전설', onSpellFireball:true},
  {type:'minion', name:"속임수 토템", cost:2, rarity:'일반', atk:0, hp:3, tribe:'토템', endCast:3},
  // ---- v75 ----
  {type:'minion', name:"대마법사 바르고스", cost:3, atk:2, hp:6, rarity:'전설', elusive:true, endRecast:true},
  {type:'minion', name:"로데브", cost:5, atk:5, hp:5, rarity:'전설', effect:{type:'spellTax', value:5}},
  // ---- v76 (룬은 주문 속성 자리에 school 로 넣음) ----
  {type:'minion', name:"노움 쩝쩝이", cost:6, rarity:'특급', atk:5, hp:6, taunt:true, lifesteal:true, tribe:'언데드', endAttack:true},   // 내 턴이 끝날 때 생명력이 가장 낮은 적을 공격
  {type:'minion', name:"흉측한 허물", cost:6, rarity:'특급', atk:3, hp:5, school:['혈기'], rc:{'혈기':1}, tribe:'언데드 / 야수', leechBoost:true, effect:{type:'leechSummon', count:2}},   // 룬: 혈기 1개. 거머리가 1 더 훔침 / 전투의 함성: 0/2 거머리 둘
  {type:'spell', name:"흡혈", cost:2, rarity:'일반', school:['혈기'], rc:{'혈기':3}, effect:{type:'bloodSip', value:5, corpses:3}},                                      // 룬: 혈기 3개
  {type:'spell', name:"피의 역병", cost:5, rarity:'희귀', school:['혈기'], rc:{'혈기':2}, effect:{type:'bloodPlague', draw:2, count:2}},                                // 룬: 혈기 2개
  {type:'spell', name:"공기 누출", cost:6, rarity:'희귀', school:['혈기','부정'], rc:{'혈기':1,'부정':1}, effect:{type:'airLeak', atk:5, hp:5, life:5, corpses:5}},               // 룬: 혈기 1개, 부정 1개
  // ---- v78 ----
  {type:'minion', name:"혈기술사", cost:2, rarity:'일반', atk:2, hp:3, school:['혈기'], rc:{'혈기':1}, effect:{type:'bloodDiscover', corpses:2}},                      // 시체를 소모해 혈기 카드 발견 (소모 수는 임의로 2)
  {type:'minion', name:"마우와 파우", cost:4, atk:2, hp:8, rarity:'전설', school:['혈기','부정'], rc:{'혈기':1,'부정':1}, tribe:'언데드', endCorpses:5, startSpend:{corpses:5, life:5}},
  {type:'minion', name:"그훈", cost:8, atk:8, hp:1, rarity:'전설', school:['혈기'], rc:{'혈기':3}, effect:{type:'bloodDrain', value:6}},
  {type:'minion', name:"전장의 강령술사", cost:2, rarity:'일반', atk:2, hp:2, school:['부정'], runes:{unholy:1}, endRaise:true},
  {type:'minion', name:"소리치는 요들러", cost:4, rarity:'희귀', atk:3, hp:4, tribe:'언데드', effect:{type:'yodel'}},
  {type:'minion', name:"악성 공포물", cost:4, rarity:'희귀', atk:2, hp:4, tribe:'언데드', revive:true, endCopy:{corpses:4}},
  {type:'minion', name:"어둠가시 바느질꾼", cost:4, rarity:'희귀', atk:2, hp:4, tribe:'언데드 / 가시멧돼지', school:['부정'], runes:{unholy:1}, endScatter:'atk'},
  {type:'spell', name:"시체 폭발", cost:5, rarity:'희귀', school:['암흑'], runes:{blood:2}, effect:{type:'corpseBlast'}},
  {type:'minion', name:"피의 기록관 말라코르", cost:2, rarity:'전설', atk:2, hp:3, school:['혈기'], rc:{'혈기':1}, effect:{type:'malakor'}},   // v97
  {type:'minion', name:"거머리 어미 발토라", cost:6, rarity:'전설', atk:5, hp:5, school:['혈기'], rc:{'혈기':1}, effect:{type:'valtora'}},   // v97
  {type:'spell', name:"피의 소용돌이", cost:5, school:['암흑'], runes:{blood:2}, rarity:'특급', effect:{type:'bloodVortex'}},   // v97
  {type:'minion', name:"시초자", cost:7, rarity:'전설', atk:7, hp:9, effect:{type:'originator'}},   // v97
  // ---- v79 악마 ----
  {type:'minion', name:"분노의 여사제", cost:7, rarity:'희귀', atk:6, hp:7, tribe:'악마', endScatter:6},
  {type:'minion', name:"신화의 공포", cost:7, rarity:'특급', atk:4, hp:10, lifesteal:true, tribe:'악마 / 야수', endBait:true},
  {type:'minion', name:"타락심장 심문관", cost:8, rarity:'특급', atk:8, hp:8, taunt:true, tribe:'악마', spellAura:2},
  {type:'minion', name:"고대의 공허 사냥개", cost:9, rarity:'특급', atk:10, hp:10, tribe:'악마', endSteal:true},
  {type:'minion', name:"원한 맺힌 소환사", cost:5, rarity:'희귀', atk:4, hp:4, effect:{type:'revealSummon'}},
  {type:'minion', name:"가젯잔 경매인", cost:5, rarity:'희귀', atk:4, hp:4, onSpellDraw:true},
  {type:'minion', name:"비전 거인", cost:12, rarity:'특급', atk:8, hp:8, dynCost:'cast'},
  {type:'spell', name:"엄폐", cost:1, rarity:'일반', effect:{type:'cover'}},
  // ---- v80 ----
  {type:'minion', name:"별 관측자", cost:8, atk:8, hp:8, rarity:'희귀', tribe:'야수', taunt:true, elusive:true, spellburst:{heroAtk:8, armor:8}},   // 주문폭주: 내가 주문을 시전한 뒤 1회 — 이번 턴 영웅 공격력 +8, 방어도 +8 (발동 후 키워드 사라짐)
  {type:'minion', name:"지저왕", cost:7, atk:6, hp:6, rarity:'특급', tribe:'언데드', rush:true, effect:{type:'armorCry', value:6}, deathArmor:6},   // 속공 / 전투의 함성과 죽음의 메아리: 방어도 6
  // ---- v81 ----
  {type:'minion', name:"지진발", cost:8, atk:8, hp:8, rarity:'희귀', tribe:'야수', taunt:true, elusive:true, deathBuffAll:3},   // 죽음의 메아리: 내 손과 덱의 모든 하수인 +3/+3
  {type:'minion', name:"하드로녹스", cost:9, atk:3, hp:7, rarity:'전설', tribe:'야수', deathGrave:true},   // 죽음의 메아리: 이번 게임에 죽은 내 도발 하수인들을 소환
  {type:'minion', name:"아비아나", cost:9, atk:5, hp:5, rarity:'전설', costOne:true},   // 내 하수인(카드)의 비용이 1
  {type:'minion', name:"티란투스", cost:10, atk:14, hp:14, rarity:'전설', tribe:'야수', taunt:true, elusive:true},
  {type:'minion', name:"잊힌 왕 쿤", cost:10, atk:7, hp:7, rarity:'전설', tribe:'언데드', effect:{type:'kuhn'}},
  // ---- v100 독성 / 연꽃 / 독사 (이미지 연결 없음. 비용·능력치·주문 이름은 임의로 정함) ----
  {type:'minion', name:"왕궁정원사", cost:4, rarity:'희귀', atk:2, hp:4, endLotus:true},   // 내 턴이 끝날 때마다 「피어오르는 연꽃」(0/2, 은신, 내 턴 시작 시 피해 입은 아군 무작위 1명 3 회복) 소환
  {type:'minion', name:"뱀사육사", cost:5, rarity:'희귀', atk:2, hp:4, endViper:true},      // 내 턴이 끝날 때 「치명적인 독사」(1/1 속공·은신·독성) 1마리 소환
  // ---- v103 (비용·능력치는 지정값) ----
  {type:'spell', name:"공허의 영혼", cost:1, rarity:'일반', effect:{type:'voidSoul', value:1}},   // 비용 N 무작위 하수인 소환 → 미래의 공허의 영혼 개선(N+1), 내 턴이 끝나면 손패로 돌아온다
  {type:'minion', name:"카인 선퓨리", cost:4, rarity:'전설', atk:3, hp:5, charge:true, ignoreTaunt:true},
  {type:'minion', name:"강철나무 골렘", cost:4, rarity:'희귀', atk:3, hp:6, taunt:true, needArmor:3},
  {type:'minion', name:"여름의 평화수호자", cost:5, rarity:'희귀', atk:4, hp:5, effect:{type:'peaceDraw', min:6, count:2, discount:2}},
  // ---- v104 ----
  {type:'minion', name:"늘푸른 수사슴", cost:6, rarity:'특급', atk:6, hp:7, tribe:'야수', elusive:true, lifesteal:true, taunt:true},
  {type:'minion', name:"재생의 드루이드", cost:5, rarity:'희귀', atk:3, hp:5, school:['자연'], effect:{type:'natureCast', count:3}},
  {type:'minion', name:"토이란투스", cost:6, rarity:'특급', atk:7, hp:7, tribe:'야수', taunt:true, elusive:true, effect:{type:'crystalBuff', need:10, value:7}},
  {type:'minion', name:"날개 달린 수호자", cost:7, rarity:'특급', atk:6, hp:8, tribe:'야수', taunt:true, revive:true, reviveFull:true, elusive:true},
  {type:'spell', name:"독사 떼", cost:4, rarity:'희귀', school:['자연'], hunter:true, effect:{type:'summon', count:3, atk:1, hp:1, token:'치명적인 독사', kw:['은신','독성'], extra:{stealth:true, poison:true}}},   // 속공·은신·독성 1/1 세 마리 소환   // 선택: 방어도 +10 / 마나 수정 모두 회복
  // ---- v105 사냥꾼 (hunter:true 는 '사냥꾼 카드' 표시. 야수 하수인도 모두 사냥꾼 카드로 친다 — isHunter 참고) ----
  {type:'spell', name:"실탄 장전", cost:0, rarity:'일반', hunter:true, effect:{type:'bulletLoad'}},   // 이번 턴에 내가 주문을 시전할 때마다 무작위 사냥꾼 카드를 손패로
  {type:'spell', name:"성게 가시", cost:1, rarity:'일반', hunter:true, effect:{type:'spellPoison'}},   // 이번 턴에 내 주문이 독성을 가짐
  {type:'minion', name:"사스퀙", cost:7, rarity:'전설', atk:4, hp:5, tribe:'야수', hunter:true, effect:{type:'repeatLast'}},   // 전투의 함성: 이전 턴에 낸 모든 카드를 반복
  {type:'minion', name:"골드린", cost:9, rarity:'전설', atk:9, hp:9, tribe:'야수', hunter:true, rush:true, beastDouble:true},   // 속공 / 아군 야수가 주는 피해 2배
  {type:'minion', name:"왕 크루쉬", cost:9, rarity:'전설', atk:8, hp:8, tribe:'야수', hunter:true, charge:true},
  // ---- v106 ----
  {type:'minion', name:"밴조사우루스", cost:10, rarity:'특급', atk:5, hp:6, tribe:'야수', rush:true, onAttackBeast:true},
  {type:'minion', name:"에메리스", cost:10, rarity:'전설', atk:8, hp:8, tribe:'용족', effect:{type:'doubleHand'}},
  {type:'minion', name:"불꽃꼬리 전사", cost:3, rarity:'일반', atk:2, hp:4, onSpellScatter:2},
  {type:'minion', name:"주문사수", cost:3, rarity:'일반', atk:3, hp:4, effect:{type:'spellHunt'}},
  {type:'minion', name:"깊은물 기원사", cost:4, rarity:'일반', atk:3, hp:4, tribe:'해적', effect:{type:'drawSpellArmor'}},
  {type:'minion', name:"바르덴 던그래스프", cost:4, rarity:'전설', atk:3, hp:3, effect:{type:'frostWarden', value:4}},
  {type:'minion', name:"요그사론의 종복", cost:5, rarity:'희귀', atk:5, hp:4, elusive:true, endCastMin:5},
  {type:'minion', name:"진눈깨비 스케이터", cost:5, rarity:'희귀', atk:3, hp:4, tribe:'정령', mini:true, effect:{type:'sleetFreeze'}},
  {type:'minion', name:"시프", cost:6, rarity:'희귀', atk:4, hp:6, spellDmgSchools:true},
  {type:'minion', name:"회색 현자 앵무새", cost:6, rarity:'희귀', atk:4, hp:5, tribe:'야수', effect:{type:'parrot', min:6}},
  // ---- v108 ----
  {type:'spell', name:"대규모 변이", cost:7, rarity:'특급', school:['비전'], effect:{type:'massTransform'}},   // 모든 하수인(양쪽 전부)을 1/1 양으로
  {type:'minion', name:"용소환사 알라나", cost:9, rarity:'전설', atk:3, hp:3, effect:{type:'alana', min:5}},   // 전투의 함성: 이번 게임에 내가 비용 5 이상 주문을 시전한 횟수만큼 5/5 용 소환
  {type:'minion', name:"화염용", cost:5, rarity:'일반', atk:5, hp:5, tribe:'용족'},
  {type:'minion', name:"불굴의 토레스", cost:5, rarity:'전설', atk:3, hp:4, taunt:true, shield:true, shieldAura:3},   // 내 보호막들은 세 번 피해를 받아야 부서진다
  // ---- v109 ----
  {type:'minion', name:"태양지기 타림", cost:6, rarity:'전설', atk:3, hp:7, taunt:true, effect:{type:'tarim', value:3}},   // 전투의 함성: 다른 모든 하수인의 공격력·생명력을 3으로
  {type:'minion', name:"성기사 에드릭", cost:7, rarity:'전설', atk:3, hp:7, effect:{type:'edric', value:1}},   // 전투의 함성: 모든 적 하수인의 공격력을 1로
  {type:'minion', name:"안녕극단", cost:9, rarity:'특급', atk:3, hp:6, tribe:'기계', taunt:true, shield:true, deathMachines:3},   // 죽음의 메아리: 도발·보호막 1/2 기계 셋
  {type:'minion', name:"정신의 창조술사", cost:1, rarity:'일반', atk:1, hp:2, tribe:'언데드', effect:{type:'mindCopy'}},   // 전투의 함성: 상대 덱의 카드를 복사해 내 손으로
  {type:'minion', name:"세데크 장막직공", cost:2, rarity:'일반', atk:2, hp:3, spellWeave:true},   // 내가 하수인에게 주문을 시전한 후, 하수인을 대상으로 지정할 수 있는 주문을 손으로
  // ---- v110 ----
  {type:'spell', name:"영혼 채찍", cost:2, rarity:'일반', school:['암흑'], effect:{type:'soulWhip', value:1}},   // 생명력 흡수, 모든 하수인에게 피해 1
  {type:'spell', name:"생각 훔치기", cost:2, rarity:'일반', school:['암흑'], effect:{type:'mindSteal', value:2}},   // 상대 덱에서 카드 2장 복사해 손으로
  {type:'spell', name:"정신 분열", cost:2, rarity:'일반', school:['암흑'], effect:{type:'mindBlast', value:5}},   // 적 영웅에게 피해 5
  {type:'spell', name:"천상의 정신", cost:2, rarity:'일반', school:['신성'], effect:{type:'divineSpirit'}},   // 하수인의 생명력 2배
  {type:'minion', name:"대주교 베네딕투스", cost:7, rarity:'전설', atk:4, hp:6, effect:{type:'benedictus', value:1}},   // 전투의 함성: 상대 덱을 복사해 내 덱에 섞고 그 카드들의 비용 -1
  // ---- v111 ----
  {type:'spell', name:"암흑의 정수", cost:7, rarity:'특급', school:['암흑'], effect:{type:'darkEssence'}},   // 내 덱의 무작위 하수인을 복사해 5/5로 소환
  {type:'minion', name:"그훈의 피", cost:9, rarity:'특급', atk:8, hp:8, tribe:'정령', taunt:true, endDeckCopy:true},   // 내 턴이 끝날 때 내 덱의 하수인을 복사해 5/5로 소환
  {type:'minion', name:"흑요석 석상", cost:9, rarity:'특급', atk:4, hp:8, taunt:true, lifesteal:true, deathKill:true},   // 죽음의 메아리: 무작위 적 하수인 처치
  {type:'spell', name:"대규모 부활", cost:9, rarity:'특급', school:['신성'], effect:{type:'massRaise', count:3}},   // 이번 게임에 죽은 아군 하수인 셋을 무작위로 소환
  {type:'minion', name:"무덤괴수", cost:12, rarity:'특급', atk:7, hp:8, tribe:'언데드', taunt:true, dynCost:'cast'},   // 도발, 이번 게임에 내가 시전한 주문 1개당 비용 -1 (비전 거인과 같은 방식)
  {type:'spell', name:"칼날 부채", cost:2, rarity:'일반', effect:{type:'fanKnives'}},   // 모든 적 하수인에게 피해 1, 카드 1장 뽑기
  {type:'spell', name:"타르막", cost:1, rarity:'일반', effect:{type:'tarmak'}},   // 이번 턴 하수인이 받는 피해 2배, 대상에게 피해 1
  {type:'minion', name:"얼굴 수집가", cost:3, rarity:'희귀', atk:2, hp:2, echo:true, effect:{type:'faceCollector', min:5, discount:5}},   // 잔상 / 전투의 함성: 비용 5 이상 무작위 하수인을 손으로 (비용 -5)
  {type:'minion', name:"소냐 워터댄서", cost:4, rarity:'전설', atk:3, hp:3, sonya:true},   // 비용 1 하수인을 낸 후, 그 하수인의 비용 0 복사본을 손으로
  {type:'minion', name:"엘프 음악가", cost:3, rarity:'일반', atk:3, hp:3, effect:{type:'comboDraw', count:2}},   // 연계: 내 덱에서 하수인 둘 뽑기
  {type:'minion', name:"무역왕 갤리윅스", cost:6, rarity:'전설', atk:5, hp:8, gally:true},   // 상대가 주문을 시전할 때마다 그 주문을 복사해 내 손으로, 상대에게 동전
  {type:'spell', name:"전력 질주", cost:5, rarity:'희귀', effect:{type:'draw', value:4}},
  {type:'spell', name:"환영의 물약", cost:4, rarity:'희귀', school:['비전'], effect:{type:'illusionPotion'}},   // 아군 하수인을 1/1 비용 1 복사본으로 손패에
  {type:'spell', name:"오메가 조립 시설", cost:1, rarity:'일반', effect:{type:'omegaFacility'}},   // 기계 발견 (마나 수정 10개면 3장 모두)
  {type:'minion', name:"겁에 질린 조합원", cost:2, rarity:'일반', atk:2, hp:3, taunt:true, effect:{type:'tauntDiscoverBc'}},   // 도발 / 전투의 함성: 도발 하수인 발견
  {type:'spell', name:"용의 포효", cost:2, rarity:'일반', effect:{type:'dragonRoar', count:2}},   // 무작위 용족 둘을 손으로
  {type:'minion', name:"대장군 분", cost:4, rarity:'전설', atk:4, hp:3, effect:{type:'copyDragons'}},   // 전투의 함성: 내 손의 모든 용족을 복사
  {type:'spell', name:"앙심", cost:4, rarity:'희귀', effect:{type:'grudge'}},   // 모든 하수인에게 피해 2, 처치한 하수인 하나당 방어도 +2
  {type:'minion', name:"다리우스 크롤리", cost:5, rarity:'전설', atk:4, hp:5, rush:true, crowley:2},   // 속공 / 공격으로 다른 하수인을 처치하면 +2/+2
  {type:'minion', name:"대지조각가 이프", cost:8, rarity:'전설', atk:4, hp:8, endArmorSummon:true},   // 내 턴이 끝날 때 방어도(최대 10)와 같은 비용의 무작위 하수인 소환
  {type:'minion', name:"토르톨라", cost:10, rarity:'전설', atk:1, hp:30, tribe:'야수', taunt:true, elusive:true, tortola:true},   // 도발·모면 / 피해를 받으면 방어도 +1, 공격력 +1
  {type:'minion', name:"문제아", cost:8, rarity:'특급', atk:6, hp:8, endBully:true},   // 내 턴이 끝날 때 무작위 적을 공격하는 3/3 불량배 둘 소환
  {type:'minion', name:"두억시니", cost:9, rarity:'특급', atk:6, hp:6, effect:{type:'repeatAll'}},   // 전투의 함성: 이번 게임에 내가 낸 다른 전투의 함성 효과들을 반복 (대상 무작위)
  {type:'spell', name:"해일", cost:8, rarity:'특급', school:['자연'], effect:{type:'soulWhip', value:3}},   // 생명력 흡수, 모든 하수인에게 피해 3
  {type:'minion', name:"걸어 다니는 샘", cost:8, rarity:'특급', atk:4, hp:8, tribe:'정령', lifesteal:true, rush:true, windfury:true},   // 생명력 흡수, 속공, 질풍
  {type:'minion', name:"눈사태 수호자", cost:6, rarity:'희귀', atk:5, hp:5, tribe:'정령', effect:{type:'avalancheFreeze'}},   // 전투의 함성: 다른 모든 하수인 빙결
  {type:'spell', name:"퇴화", cost:2, rarity:'일반', school:['자연'], effect:{type:'devolve'}},   // 모든 적 하수인을 비용이 (1) 낮은 무작위 하수인으로 변신
  // ---- v112 ----
  {type:'spell', name:"불안정한 진화", cost:1, rarity:'일반', school:['자연'], echo:true, effect:{type:'upgradeMinion'}},   // 잔상 / 아군 하수인을 비용이 (1) 높은 무작위 하수인으로 변신
  {type:'minion', name:"깊은무쇠 트로그", cost:1, rarity:'일반', atk:1, hp:2, trogg:true},   // 상대편이 주문을 시전한 후에, 다른 깊은무쇠 트로그를 소환
  {type:'minion', name:"교단 수련사", cost:2, rarity:'일반', atk:3, hp:2, effect:{type:'spellTax', value:1}},   // 전투의 함성: 다음 턴 상대 주문 비용 +1
  {type:'minion', name:"보석 박힌 딱정벌레", cost:2, rarity:'일반', atk:1, hp:1, tribe:'야수', effect:{type:'discoverCost', cost:3}},   // 전투의 함성: 비용 3인 카드 발견
  {type:'minion', name:"비겁한 밀고자", cost:2, rarity:'일반', atk:2, hp:6, taunt:true, effect:{type:'snitch'}},   // 도발 / 전투의 함성: 상대가 손에서 무작위 하수인을 소환 (그 하수인의 전투의 함성은 발동 안 함)
  {type:'minion', name:"안녕로봇", cost:2, rarity:'희귀', atk:1, hp:2, tribe:'기계', taunt:true, shield:true},   // 도발, 천상의 보호막(=보호막)
  {type:'minion', name:"데스윙", cost:10, rarity:'전설', atk:12, hp:12, tribe:'용족', effect:{type:'deathwing'}},   // 전투의 함성: 다른 모든 하수인 처치, 내 손패 모두 버림
  {type:'minion', name:"광염의 피락", cost:8, rarity:'전설', atk:7, hp:7, tribe:'용족', fireImmune:true, effect:{type:'pyroar', total:15}},   // 화염 주문 면역 / 전투의 함성: 마나 합 15의 화염 주문들을 무작위 적에게 시전
  {type:'minion', name:"해방된 분노 이샤라즈", cost:10, rarity:'전설', atk:10, hp:10, endDeckSummon:true},   // 내 턴이 끝날 때 내 덱에서 하수인 소환
  {type:'minion', name:"허기진 포식자", cost:9, rarity:'특급', atk:4, hp:4, infuse:5, effect:{type:'devour', value:5}},   // 적 하수인을 잡아먹고 능력치 획득 / 주입(5): 양옆도 잡아먹음
  {type:'minion', name:"부상당한 크발디르", cost:1, rarity:'전설', atk:2, hp:4, tribe:'언데드', effect:{type:'selfHurt', value:3}},   // 전투의 함성: 내 영웅에게 피해 3
  {type:'minion', name:"부정한 알", cost:1, rarity:'일반', atk:0, hp:2, tribe:'언데드', eggChicken:true},   // 죽음의 메아리: 3/3 언데드 닭 소환 / 내 턴이 끝날 때마다 그 닭 +1/+1
  {type:'minion', name:"불안정한 프로토타입", cost:1, rarity:'일반', atk:0, hp:1, tribe:'기계', revive:true, deathProto:true},   // 환생 / 죽음의 메아리: 하수인 뽑기, 손패 하수인 전체 +1/+1
  {type:'minion', name:"검 제작의 대가", cost:2, rarity:'일반', atk:1, hp:3, endSword:true},   // 내 턴이 끝날 때 다른 무작위 아군 하수인 둘의 공격력 +1
  {type:'minion', name:"공작 켈레세스", cost:2, rarity:'전설', atk:2, hp:2, tribe:'언데드', effect:{type:'deckBuff', value:1}},   // 전투의 함성: 내 덱의 모든 하수인 +1/+1
  // ---- 추가 카드 ----
  {type:'minion', name:"곰팡이술사", cost:4, rarity:'희귀', atk:2, hp:2, effect:{type:'adjBuffCry', value:2}, deathAdjBuff:2},   // 전투의 함성·죽음의 메아리: 양옆 하수인 +2/+2
  {type:'minion', name:"깔깔대는 발명가", cost:5, rarity:'희귀', atk:2, hp:1, effect:{type:'machinesCry', count:2}},   // 전투의 함성: 도발·보호막 1/2 기계 둘 소환
  {type:'minion', name:"기사대장", cost:5, rarity:'특급', atk:3, hp:3, rush:true, crowley:3, effect:{type:'damage', value:3}},   // 속공 / 공격으로 적 하수인을 처치하면 +3/+3 / 전투의 함성: 피해 3
  {type:'minion', name:"누더기골렘", cost:5, rarity:'특급', atk:4, hp:4, tribe:'언데드', taunt:true, revive:true, deathAoe:2},   // 도발, 환생 / 죽음의 메아리: 모든 캐릭터에게 피해 2
  {type:'minion', name:"공격대장", cost:3, rarity:'희귀', atk:2, hp:3, atkAura:1, effect:{type:'spiritsCry', count:2, atk:1, hp:1, aura:1}},   // 내 다른 하수인 공격력 +1 / 전투의 함성: 1/1 나무정령 둘
  {type:'minion', name:"공중급수체", cost:3, rarity:'희귀', atk:2, hp:2, deathSummon:1, effect:{type:'spiritsCry', count:1, atk:2, hp:2, death:true}},   // 전투의 함성·죽음의 메아리: 2/2 나무정령
  {type:'minion', name:"나무정령", cost:1, rarity:'일반', atk:2, hp:2},   // 토큰 (일반 하수인)
  {type:'minion', name:"지하군주", cost:3, rarity:'희귀', atk:1, hp:6, tribe:'언데드', taunt:true, lordGrow:1},   // 도발 / 내 하수인이 소환된 후 생명력 +1
  {type:'minion', name:"마력 깃든 까마귀", cost:1, rarity:'일반', atk:2, hp:2, tribe:'야수'},   // 일반 하수인
  {type:'minion', name:"부화장 도우미", cost:3, rarity:'일반', atk:2, hp:3, effect:{type:'hatchCry', value:1, max:2}},   // 전투의 함성: 공격력 2 이하 내 다른 하수인 +1/+1, 도발
  {type:'minion', name:"비명익룡 알", cost:3, rarity:'희귀', atk:0, hp:2, deathPtero:4, pteroEgg:3},   // 죽음의 메아리: 2/1 새끼 넷 / 내 턴이 3번 끝나면 알이 깨져 내 전장을 4/4 익룡으로 채움
  {type:'minion', name:"엘룬의 예언자", cost:3, rarity:'일반', atk:2, hp:4, copyLow:2},   // 비용 2 이하 하수인을 손에서 낸 후, 그 하수인을 복사해 소환
  {type:'minion', name:"오늘의 월척", cost:1, rarity:'희귀', atk:3, hp:3, tribe:'야수', rush:true, fishHeal:true, effect:{type:'wormCry'}},   // 속공 / 전투의 함성: 상대에게 2/1 지렁이 / 공격으로 하수인 처치 시 생명력 전부 회복
  {type:'minion', name:"브롤 베어맨틀", cost:5, rarity:'전설', atk:3, hp:5, onSpellBeast:3},   // 내가 주문을 시전한 후, 비용 3 이하 야수 소환
  {type:'minion', name:"그물거미", cost:1, rarity:'일반', atk:1, hp:1, tribe:'야수', deathBeast:true},   // 죽음의 메아리: 무작위 야수를 얻음
  {type:'minion', name:"여명회 파수병", cost:2, rarity:'일반', atk:3, hp:2, effect:{type:'shieldCry'}},   // 전투의 함성: 아군 하수인에게 보호막
  {type:'spell', name:"채광 사상자", cost:2, rarity:'일반', effect:{type:'summon', count:2, atk:1, hp:1, token:'은빛 성기사단 신병', rush:false, extra:{deathGhoul:1}, text:"'죽음의 메아리: 1/1 취약한 구울을 소환함' 능력이 있는 1/1 은빛 성기사단 신병을 둘 소환합니다"}},   // 죽으면 1/1 구울을 남기는 신병 둘
  {type:'spell', name:"평등", cost:2, rarity:'일반', school:['신성'], effect:{type:'equality'}},   // 모든 하수인의 생명력을 1로
  {type:'minion', name:"대사제 데칼", cost:3, rarity:'전설', atk:3, hp:4, effect:{type:'decalCry'}},   // 전투의 함성: 내 영웅 생명력 1, 감소한 만큼 방어도
  {type:'spell', name:"병력 소집", cost:3, rarity:'일반', effect:{type:'summon', count:4, atk:1, hp:1, token:'은빛 성기사단 신병', rush:false, text:"1/1 은빛 성기사단 신병을 4명 소환합니다"}},
  {type:'spell', name:"신의 은총", cost:3, rarity:'일반', school:['신성'], effect:{type:'divineFavor'}},   // 상대 손패 수와 같아질 때까지 뽑기
  {type:'minion', name:"거품로봇", cost:4, rarity:'일반', atk:4, hp:4, tribe:'기계', effect:{type:'bubbleCry'}},   // 전투의 함성: 내 다른 기계에게 보호막·도발
  {type:'minion', name:"창심장 파수병", cost:4, rarity:'희귀', atk:3, hp:4, tribe:'용족', endSpellGain:{school:'신성', discount:3}},   // 내 턴이 끝날 때 무작위 신성 주문 (비용 -3)
  {type:'minion', name:"부두 토템", cost:2, rarity:'일반', atk:0, hp:4, tribe:'토템', endSpellGain:{school:'암흑', discount:0}},   // 내 턴이 끝날 때 무작위 암흑 주문
  {type:'minion', name:"거대한 토템 아이스오르", cost:3, rarity:'전설', atk:0, hp:4, tribe:'토템', endTotemBuff:1},   // 내 턴이 끝날 때 손·덱·전장의 다른 토템 +1/+1
  {type:'minion', name:"불꽃의 토템", cost:2, rarity:'일반', atk:0, hp:3, tribe:'토템', adjAtkAura:2},   // 양옆 하수인 공격력 +2
  {type:'minion', name:"물 공급 토템", cost:2, rarity:'일반', atk:0, hp:3, tribe:'토템', endAdjBuff:1},   // 내 턴이 끝날 때 양옆 하수인 +1/+1
  // ---- v113 ----
  {type:'minion', name:"스테레오 토템", cost:2, rarity:'일반', atk:0, hp:3, tribe:'토템', endHandBuff:2},   // 내 턴이 끝날 때 내 손의 무작위 하수인 +2/+2
  {type:'minion', name:"죄악석 토템", cost:1, rarity:'일반', atk:0, hp:3, tribe:'토템', endSelfHp:1},   // 내 턴이 끝날 때 생명력 +1
  {type:'minion', name:"토템 골렘", cost:2, rarity:'일반', atk:3, hp:4, tribe:'토템', overload:1},   // 과부하 (1)
  {type:'minion', name:"돌장인", cost:4, rarity:'일반', atk:5, hp:4, effect:{type:'stoneCry', value:2}},   // 전투의 함성: 이번 게임 동안 내 토템 공격력 +2
  {type:'minion', name:"칼바람 폭풍소환사", cost:5, rarity:'희귀', atk:5, hp:5, effect:{type:'stormCry', need:4}},   // 전투의 함성: 내 전장에 토템 4기 이상이면 알아키르 소환
  {type:'minion', name:"바람의 군주 알아키르", cost:8, rarity:'전설', atk:3, hp:6, tribe:'정령', windfury:true, charge:true, taunt:true, shield:true},   // 질풍, 돌진, 도발, 천상의 보호막
];

if (typeof module !== 'undefined') { module.exports = { CARD_POOL }; }
