게임에 쓰는 그림 (파일 이름을 바꾸면 게임에서 안 보여요)

  team1.png ~ team6.png              모둠 캐릭터 (1 고양이, 2 강아지, 3 토끼, 4 곰, 5 오리, 6 햄스터)
  team1_happy.png ~ team6_happy.png  기뻐하는 표정 (정답·1등일 때)
  background.jpg                     바다 배경 (16:9)
  tile_empty / treasure / fort / t1~t6.png   땅 타일 (흰 타일 한 장에 색을 입혀 만든 것)
  coin sack chest wall flag crown letter star hourglass .png   아이콘
  deco_palm / rocks / ship / shells / gull / lighthouse .png  섬 둘레 소품

그림을 새로 바꾸려면 (컴퓨터에 파이썬이 있을 때)
  캐릭터 한 장:   python3 tools/slice_sprites.py 그림.webp single team1
  아이콘 시트:    python3 tools/slice_sprites.py 시트.png icons
  소품 시트:      python3 tools/slice_sprites.py 시트.png decor
  흰 타일:        python3 tools/make_tiles.py 타일.webp
