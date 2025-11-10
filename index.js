require('dotenv').config();
const Discord = require('discord.js');

const client = new Discord.Client({
  intents: [
    Discord.GatewayIntentBits.Guilds,
    Discord.GatewayIntentBits.GuildMessages,
    Discord.GatewayIntentBits.MessageContent,
    Discord.GatewayIntentBits.GuildMembers
  ]
});

// تخزين البيانات
const userPoints = new Map();
const userInvites = new Map();
const inviteCounts = new Map();
const joinedMembers = new Set();

client.on('ready', async () => {
  console.log(`البوت شغال: ${client.user.tag}`);
  
  for (const guild of client.guilds.cache.values()) {
    const invites = await guild.invites.fetch();
    invites.forEach(invite => {
      inviteCounts.set(invite.code, invite.uses || 0);
      if (invite.inviter) {
        userInvites.set(invite.inviter.id, invite.code);
      }
    });
    
    // حفظ الاعضاء الحاليين
    guild.members.cache.forEach(member => {
      joinedMembers.add(member.id);
    });
  }
});

client.on('guildMemberAdd', async (member) => {
  const guild = member.guild;
  
  try {
    // التحقق من عمر الحساب
    const accountAge = Date.now() - member.user.createdAt.getTime();
    const daysOld = accountAge / (1000 * 60 * 60 * 24);
    
    if (daysOld < 15) {
      console.log(`الحساب جديد اقل من 15 يوم: ${member.user.tag}`);
      return;
    }
    
    // التحقق اذا كان داخل قبل كذا
    if (joinedMembers.has(member.id)) {
      console.log(`العضو كان داخل قبل: ${member.user.tag}`);
      return;
    }
    
    const newInvites = await guild.invites.fetch();
    let usedInvite = null;
    
    for (const [code, invite] of newInvites) {
      const oldUses = inviteCounts.get(code) || 0;
      const newUses = invite.uses || 0;
      
      if (newUses > oldUses) {
        usedInvite = invite;
        inviteCounts.set(code, newUses);
        break;
      }
    }
    
    if (usedInvite && usedInvite.inviter) {
      const inviterId = usedInvite.inviter.id;
      const currentPoints = userPoints.get(inviterId) || 0;
      userPoints.set(inviterId, currentPoints + 1);
      
      // حفظ ان العضو دخل
      joinedMembers.add(member.id);
      
      console.log(`${usedInvite.inviter.tag} اخذ نقطة! المجموع: ${currentPoints + 1}`);
      
      try {
        const inviter = await guild.members.fetch(inviterId);
        await inviter.send(`مبروك! واحد دخل من رابطك واخذت نقطة\nنقاطك الحين: ${currentPoints + 1}`);
      } catch (e) {
        console.log('ما قدرت ارسل رسالة خاصة');
      }
    }
  } catch (error) {
    console.error('خطأ:', error);
  }
});

// تتبع الاعضاء اللي يطلعون
client.on('guildMemberRemove', (member) => {
  console.log(`عضو طلع: ${member.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  
  // أمر النقاط
  if (message.content === '*p') {
    const userId = message.author.id;
    const points = userPoints.get(userId) || 0;
    
    await message.reply(`**نقاطك هي ${points}**`);
  }
  
  // أمر رابط الدعوة
  if (message.content === '*invite') {
    try {
      const invite = await message.channel.createInvite({
        maxAge: 0,
        maxUses: 0,
        unique: true
      });
      
      userInvites.set(message.author.id, invite.code);
      inviteCounts.set(invite.code, 0);
      
      await message.reply(`رابطك:\n${invite.url}\n\nكل واحد يدخل من رابطك تاخذ نقطة`);
    } catch (error) {
      await message.reply('ما قدرت اسوي رابط، تاكد من الصلاحيات');
    }
  }
  
  // أمر العجلة
  if (message.content === '*s') {
    const userId = message.author.id;
    const points = userPoints.get(userId) || 0;
    
    const row = new Discord.ActionRowBuilder()
      .addComponents(
        new Discord.ButtonBuilder()
          .setCustomId('wheel_normal')
          .setLabel('العجلة العادية (1 نقطة)')
          .setStyle(Discord.ButtonStyle.Primary),
        new Discord.ButtonBuilder()
          .setCustomId('wheel_premium')
          .setLabel('العجلة الممتازة (2 نقطة)')
          .setStyle(Discord.ButtonStyle.Success)
      );
    
    await message.reply({
      content: `**نقاطك: ${points}**\n\nاختار نوع العجلة:`,
      components: [row]
    });
  }
  
  // أمر تصفير النقاط (للأدمن فقط)
  if (message.content === '*rest') {
    // التحقق من صلاحية الأدمن
    if (!message.member.permissions.has(Discord.PermissionFlagsBits.Administrator)) {
      await message.reply('⛔ هذا الأمر متاح فقط للأدمنستريتر!');
      return;
    }
    
    // تصفير جميع النقاط
    const totalUsers = userPoints.size;
    userPoints.clear();
    
    await message.reply(`✅ **تم تصفير نقاط جميع الأعضاء!**\n\nعدد الأعضاء: ${totalUsers}`);
  }
});

// نظام العجلة
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  
  const userId = interaction.user.id;
  const points = userPoints.get(userId) || 0;
  
  // العجلة العادية
  if (interaction.customId === 'wheel_normal') {
    if (points < 1) {
      await interaction.reply({ content: 'ما عندك نقاط كافية!', ephemeral: true });
      return;
    }
    
    userPoints.set(userId, points - 1);
    
    const prizes = [
  { name: '30 الف كريديت', weight: 35 },
  { name: '50 الف كريديت', weight: 25 },
  { name: '100 الف كريديت', weight: 20 }
];
    
    const prize = getRandomPrize(prizes);
    
    await interaction.reply({
      content: `**لفيت العجلة العادية!**\n\nربحت: **${prize}**\n\nنقاطك الحين: **${userPoints.get(userId)}**`
    });
  }
  
  // العجلة الممتازة
  if (interaction.customId === 'wheel_premium') {
    if (points < 2) {
      await interaction.reply({ content: 'ما عندك نقاط كافية!', ephemeral: true });
      return;
    }
    
    userPoints.set(userId, points - 2);
    
    const prizes = [
  { name: '60 الف كريديت', weight: 35 },
  { name: '150 الف كريديت', weight: 25 },
  { name: '250 الف كريديت', weight: 20 }
];
    
    const prize = getRandomPrize(prizes);
    
    await interaction.reply({
      content: `**لفيت العجلة الممتازة!**\n\nربحت: **${prize}**\n\nنقاطك الحين: **${userPoints.get(userId)}**`
    });
  }
});

// دالة اختيار الجائزة بالنسب
function getRandomPrize(prizes) {
  const totalWeight = prizes.reduce((sum, prize) => sum + prize.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const prize of prizes) {
    if (random < prize.weight) {
      return prize.name;
    }
    random -= prize.weight;
  }
  
  return prizes[0].name;
}

client.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error('خطأ في الدخول:', err);
});
