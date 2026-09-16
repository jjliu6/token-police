// ~100 rest / move prompts. Each hair stage keeps its own pool; the dashboard
// draws 2–3 at random and holds that offer until the user finishes one.
var ACT_LIST = [];
function addAct(stage, id, en, zh, fr) {
  ACT_LIST.push({ id, stage, en, zh, fr });
}

// high: still at the desk, 20–60 seconds
addAct('high', 'actStretch', 'Stand up and stretch 30 seconds', '站起来伸个懒腰 30 秒', 'Lève-toi et étire-toi 30 secondes');
addAct('high', 'actWater', 'Drink a glass of water', '起身喝杯水', 'Va boire un verre d\'eau');
addAct('high', 'actWindow', 'Look out the window for 20 seconds', '看看窗外 20 秒', 'Regarde par la fenêtre 20 secondes');
addAct('high', 'actNeckRoll', 'Slow neck rolls, 20 seconds', '慢慢转脖子 20 秒', 'Roule la nuque doucement, 20 secondes');
addAct('high', 'actShrug', 'Shrug your shoulders 10 times', '耸耸肩 10 次', 'Hausse les épaules 10 fois');
addAct('high', 'actWrist', 'Wrist circles 20 seconds', '转转手腕 20 秒', 'Cercles de poignets 20 secondes');
addAct('high', 'actBlink', 'Blink slowly 15 times', '慢慢眨眼 15 次', 'Cligne lentement 15 fois');
addAct('high', 'actPosture', 'Sit up tall for 30 seconds', '挺直背坐 30 秒', 'Redresse le dos 30 secondes');
addAct('high', 'actJaw', 'Unclench your jaw, drop your tongue', '别咬着牙，舌头放松', 'Desserre la mâchoire, langue relâchée');
addAct('high', 'actArmShake', 'Drop your arms and shake them out', '放下手臂抖一抖', 'Laisse tomber les bras et secoue-les');
addAct('high', 'actAnkle', 'Ankle circles under the desk', '在桌子底下转转脚踝', 'Cercles de chevilles sous le bureau');
addAct('high', 'actLookGreen', 'Look at something green for 20 seconds', '看看绿色的东西 20 秒', 'Fixe quelque chose de vert 20 secondes');
addAct('high', 'actSipWater', 'Sip water — not another coffee', '喝口水，先别续咖啡', 'Une gorgée d\'eau — pas un café de plus');
addAct('high', 'actReachUp', 'Stand and reach for the ceiling', '站起来，双手用力往上够', 'Debout, bras vers le plafond');
addAct('high', 'actEarShoulder', 'Ear-to-shoulder stretch, both sides', '头往肩膀方向压一压，两边都做', 'Oreille vers l\'épaule, des deux côtés');
addAct('high', 'actPalmPress', 'Interlace fingers and press palms out', '十指交叉，手心向外推', 'Doigts entrelacés, paumes vers l\'avant');
addAct('high', 'actShoulderBack', 'Roll shoulders back 10 times', '向后绕肩 10 圈', 'Roule les épaules en arrière 10 fois');
addAct('high', 'actEyesClosed', 'Close your eyes for 20 seconds', '闭眼休息 20 秒', 'Ferme les yeux 20 secondes');
addAct('high', 'actWiggleToes', 'Wiggle your toes inside your shoes', '在鞋子里动动脚趾', 'Remue les orteils dans tes chaussures');
addAct('high', 'actLoosenMouse', 'Let go of the mouse and uncurl your hand', '松开鼠标，把手指舒展开', 'Lâche la souris, ouvre la main');
addAct('high', 'actScreenArm', 'Push the screen to arm’s length', '把屏幕推远到一臂的距离', 'Recule l\'écran à bout de bras');
addAct('high', 'actFiveBreaths', 'Five slow breaths, longer on the exhale', '慢慢深呼吸 5 次，呼气拉长一点', 'Cinq respirations lentes, expire plus long');
addAct('high', 'actLookAround', 'Look left, then right, slowly', '慢慢向左看，再向右看', 'Regarde à gauche, puis à droite, lentement');
addAct('high', 'actChinTuck', 'Chin tucks × 8', '收下巴 8 次', 'Rentre le menton × 8');
addAct('high', 'actHandPump', 'Open and close your hands 15 times', '反复握拳、张开 15 次', 'Ouvre et ferme les mains 15 fois');
addAct('high', 'actCalfSeat', 'Flex your calves while seated', '坐着绷一绷小腿', 'Tend les mollets, assis');
addAct('high', 'actUncross', 'Uncross your legs and plant both feet', '别再翘腿，双脚放平', 'Décroise les jambes, pieds à plat');
addAct('high', 'actTiptoe', 'Stand on tiptoes 10 times', '踮踮脚 10 次', 'Monte sur la pointe des pieds 10 fois');
addAct('high', 'actPalmEyes', 'Rub palms warm, cup your eyes', '搓热手心，捂住眼睛', 'Frotte les paumes, couvre les yeux');
addAct('high', 'actFiveSounds', 'Name 5 sounds you can hear', '数一数你能听到的 5 种声音', 'Nomme 5 sons que tu entends');
addAct('high', 'actFaceAway', 'Turn your chair away from the screen 30 seconds', '把椅子转过去，背对屏幕 30 秒', 'Tourne la chaise, dos à l\'écran, 30 s');
addAct('high', 'actFillBottle', 'Fill your water bottle', '把水杯加满', 'Remplis ta bouteille d\'eau');
addAct('high', 'actFingerStretch', 'Spread your fingers wide, 10 times', '手指尽量张大 10 次', 'Écarte les doigts au max, 10 fois');
addAct('high', 'actDropShoulders', 'Drop your shoulders away from your ears', '别耸肩，把肩膀沉下来', 'Éloigne les épaules des oreilles');

// mid: stand up, 1–3 minutes
addAct('mid', 'actStand', 'Stand and roll your shoulders', '站起来转转肩膀', 'Lève-toi et roule les épaules');
addAct('mid', 'actSquats', 'Do 10 easy squats', '做 10 个轻松深蹲', 'Fais 10 squats tranquilles');
addAct('mid', 'actEyes', '20-20-20: look 20 feet away for 20 seconds', '20-20-20：看 6 米外 20 秒', '20-20-20 : regarde à 6 m pendant 20 s');
addAct('mid', 'actKitchen', 'Walk to the kitchen and back', '走到厨房再回来', 'Va jusqu\'à la cuisine et reviens');
addAct('mid', 'actWallPush', '10 easy wall push-ups', '做 10 个靠墙俯卧撑', '10 pompes contre le mur, facile');
addAct('mid', 'actMarch', 'March in place 45 seconds', '原地踏步 45 秒', 'Marche sur place 45 secondes');
addAct('mid', 'actCalfRaise', 'Calf raises × 20', '提踵 20 次', 'Élévations de mollets × 20');
addAct('mid', 'actHipCircle', 'Hip circles 20 seconds', '转转胯 20 秒', 'Cercles de hanches 20 secondes');
addAct('mid', 'actForwardFold', 'Forward fold, hang 20 seconds', '身体前屈，垂下来放松 20 秒', 'Penché en avant, laisse pendre 20 s');
addAct('mid', 'actTorsoTwist', 'Twist your torso both ways', '身体左右转一转', 'Tourne le buste des deux côtés');
addAct('mid', 'actOneFoot', 'Stand on one foot 20s each side', '单脚站 20 秒，换边', 'Tiens-toi sur un pied 20 s de chaque côté');
addAct('mid', 'actSitStand', 'Sit-to-stands × 15', '反复坐下、起立 15 次', 'Assis-debout × 15');
addAct('mid', 'actArmCircle', 'Arm circles 20 seconds', '抡一抡胳膊 20 秒', 'Cercles de bras 20 secondes');
addAct('mid', 'actLapWalk', 'Walk a lap around your space', '在屋里走一圈', 'Fais un tour de la pièce');
addAct('mid', 'actBodyShake', 'Shake out your whole body 15 seconds', '全身抖一抖 15 秒', 'Secoue tout le corps 15 secondes');
addAct('mid', 'actDoorStretch', 'Doorway chest stretch 20 seconds', '扶着门框拉伸胸口 20 秒', 'Étirement de poitrine dans l\'encadrement, 20 s');
addAct('mid', 'actHamstring', 'Hamstring stretch 20s each leg', '拉伸大腿后侧，每边 20 秒', 'Étirement des ischios, 20 s par jambe');
addAct('mid', 'actCatCow', 'Standing cat-cow × 8', '站着做猫牛式 8 次', 'Chat-vache debout × 8');
addAct('mid', 'actJacks', '10 easy jumping jacks', '开合跳 10 次，轻松来', '10 jumping jacks tranquilles');
addAct('mid', 'actHighKnees', 'High knees 20 seconds', '高抬腿 20 秒', 'Montées de genoux 20 secondes');
addAct('mid', 'actToeTouch', 'Touch your toes 8 times', '弯腰摸脚尖 8 次', 'Touche tes orteils 8 fois');
addAct('mid', 'actWallSit', 'Wall sit 20 seconds', '靠墙静蹲 20 秒', 'Chaise au mur 20 secondes');
addAct('mid', 'actNeckShoulder', 'Neck stretch + shoulder rolls', '拉伸脖子，再转转肩', 'Étirement de nuque + roulements d\'épaules');
addAct('mid', 'actStairsOnce', 'Take the stairs once', '上下一趟楼梯', 'Prends l\'escalier une fois');
addAct('mid', 'actSoftBounce', 'Stand and bounce softly 20 seconds', '站着轻轻颠一颠 20 秒', 'Debout, rebondis doucement 20 s');
addAct('mid', 'actSideLunge', 'Side lunges, 6 each side', '侧弓步，每边 6 次', 'Fentes latérales, 6 de chaque côté');
addAct('mid', 'actGluteSqueeze', 'Glute squeezes × 15', '夹紧臀部 15 次', 'Contractions des fessiers × 15');
addAct('mid', 'actFarLook', 'Stand and look far away for 1 minute', '站起来眺望远处 1 分钟', 'Debout, fixe au loin 1 minute');
addAct('mid', 'actCarryThing', 'Carry something to another room', '拿点东西送到另一个房间', 'Porte un truc dans une autre pièce');
addAct('mid', 'actAirSquat', '10 slow air squats', '慢慢做 10 个深蹲', '10 squats lents, sans charge');
addAct('mid', 'actOpenWindow', 'Open a window and breathe the air', '打开窗，吸口新鲜空气', 'Ouvre une fenêtre et respire');
addAct('mid', 'actHipOpener', 'Hip opener, 20s each side', '做开髋动作，每边 20 秒', 'Ouverture de hanche, 20 s de chaque côté');
addAct('mid', 'actCalfWalk', 'Walk on your toes to the door and back', '踮脚走到门口再回来', 'Marche sur la pointe des pieds jusqu\'à la porte et reviens');

// low: leave the desk, rest 2–5 minutes
addAct('low', 'actWalk', 'Walk to another room and back', '走到另一个房间再回来', 'Va dans une autre pièce et reviens');
addAct('low', 'actGrass', 'Touch some grass / step outside', '出门踩两脚草 / 透个气', 'Va toucher de l\'herbe / sors un instant');
addAct('low', 'actTea', 'Make tea and rest 2 minutes', '泡杯茶休息 2 分钟', 'Fais un thé et pose-toi 2 minutes');
addAct('low', 'actBlockWalk', 'Walk around the block if you can', '能出门的话绕小区走一圈', 'Fais le tour de l\'îlot si tu peux');
addAct('low', 'actLegsUp', 'Lie down, legs up the wall, 1 minute', '躺下，腿靠墙 1 分钟', 'Allongé, jambes au mur, 1 minute');
addAct('low', 'actSnackAway', 'Eat a snack away from the screen', '离开屏幕吃点东西', 'Mange un encas loin de l\'écran');
addAct('low', 'actStepOutside', 'Step outside for 2 minutes', '到外面站 2 分钟', 'Sors 2 minutes');
addAct('low', 'actWaterPlant', 'Water a plant', '给植物浇点水', 'Arrose une plante');
addAct('low', 'actFloorStretch', 'Stretch on the floor 2 minutes', '在地板上拉伸 2 分钟', 'Étire-toi au sol 2 minutes');
addAct('low', 'actWalkTalk', 'Walk while you send one message', '边走边回一条消息', 'Marche en envoyant un message');
addAct('low', 'actWashFace', 'Wash your face with cool water', '用凉水洗把脸', 'Lave-toi le visage à l\'eau froide');
addAct('low', 'actDishes', 'Do the dishes for 2 minutes', '洗 2 分钟碗', 'Fais la vaisselle 2 minutes');
addAct('low', 'actBalcony', 'Sit on the balcony / stoop', '去阳台或门口坐一会儿', 'Va t\'asseoir au balcon / sur le perron');
addAct('low', 'actSkipElevator', 'Take the stairs, skip the elevator', '走楼梯，别坐电梯', 'Prends l\'escalier, laisse l\'ascenseur');
addAct('low', 'actSunFace', 'Put sunlight on your face 1 minute', '让阳光照在脸上 1 分钟', 'Mets du soleil sur le visage 1 minute');
addAct('low', 'actLieDown', 'Lie down, no phone, 2 minutes', '躺 2 分钟，别碰手机', 'Allonge-toi, pas de téléphone, 2 minutes');
addAct('low', 'actGetMail', 'Walk to get the mail / packages', '下楼取个快递或信件', 'Va chercher le courrier / un colis');
addAct('low', 'actOneSong', 'Play one song and move to it', '放一首歌，跟着动一动', 'Lance un morceau et bouge dessus');
addAct('low', 'actTidyStand', 'Tidy one surface while standing', '站着把一处桌面收拾干净', 'Range une surface, debout');
addAct('low', 'actPetIfAny', 'Pet an animal if you have one', '有宠物的话去摸两下', 'Caresse un animal si t\'en as un');
addAct('low', 'actLookSky', 'Look at the sky for 1 minute', '抬头看看天 1 分钟', 'Regarde le ciel 1 minute');
addAct('low', 'actHallway3', 'Slow walk down the hallway 3 times', '在走廊里慢慢走 3 个来回', 'Marche lentement dans le couloir, 3 allers-retours');
addAct('low', 'actDarkEyes', 'Rest your eyes in a darker room 1 minute', '去暗一点的房间歇眼 1 分钟', 'Repose tes yeux dans une pièce plus sombre 1 min');
addAct('low', 'actHipFlexor', 'Hip-flexor stretch 30s each side', '拉伸髂腰肌，每边 30 秒', 'Étirement des fléchisseurs de hanche, 30 s par côté');
addAct('low', 'actBodyScan', '2-minute body scan, no screen', '做 2 分钟身体扫描，别看屏幕', 'Scan corporel 2 minutes, sans écran');
addAct('low', 'actWaterOtherRoom', 'Drink water in another room', '去另一个房间喝水', 'Bois de l\'eau dans une autre pièce');
addAct('low', 'actOutsideBreath', 'Stand outside and take 10 breaths', '站在门外深呼吸 10 次', 'Debout dehors, 10 respirations');
addAct('low', 'actFloorSit', 'Sit on the floor instead of the chair 2 minutes', '离开椅子，在地上坐 2 分钟', 'Assieds-toi par terre au lieu de la chaise, 2 min');
addAct('low', 'actWarmMug', 'Heat a drink and hold the mug', '热杯热饮，捧着杯子歇一会儿', 'Réchauffe une boisson et tiens le mug');
addAct('low', 'actNoScreen3', 'No screens for 3 minutes', '3 分钟不看任何屏幕', 'Aucun écran pendant 3 minutes');
addAct('low', 'actShoesWalk', 'Put on shoes and walk to the door', '穿上鞋走到门口', 'Mets tes chaussures et va jusqu\'à la porte');
addAct('low', 'actMakeBed', 'Make the bed if you haven’t', '被子还没叠的话去叠一下', 'Fais le lit si ce n\'est pas fait');
addAct('low', 'actSlowYawnWalk', 'Walk until you yawn once', '走到打出一个哈欠为止', 'Marche jusqu\'à bâiller une fois');

var ACTS = { high: [], mid: [], low: [] };
var ACT_BY_ID = {};
ACT_LIST.forEach((a) => {
  ACTS[a.stage].push(a.id);
  ACT_BY_ID[a.id] = a;
});
