const express = require('express');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const bodyParser = require('body-parser');

// ===== CONFIGURATION (Edit these values) =====
const TELEGRAM_TOKEN = '7896702985:AAHDI-tXXcnKUYf6IJFLPdfKY1MDlBNvDvc'; // Replace with your bot token
const GROUP_ID = -1002698708932; // Your group chat ID
const PERSONAL_ID = 1745313119; // Your user ID
const API_URL = 'https://ff-banner-api.vercel.app/banner/filter?region={region}';
const CHECK_INTERVAL = 300 * 1000; // 5 minutes in milliseconds

const REGIONS = {
  ind: { name: 'India', flag: '🇮🇳' },
  sg: { name: 'Singapore', flag: '🇸🇬' },
  bd: { name: 'Bangladesh', flag: '🇧🇩' },
  eu: { name: 'Europe', flag: '🇪🇺' },
  cis: { name: 'Russia', flag: '🇷🇺' },
  na: { name: 'North America', flag: '🇺🇸' },
  id: { name: 'Indonesia', flag: '🇮🇩' },
  pk: { name: 'Pakistan', flag: '🇵🇰' },
  br: { name: 'Brazil', flag: '🇧🇷' },
  me: { name: 'Middle East', flag: '🇸🇦' },
  th: { name: 'Thailand', flag: '🇹🇭' },
  sac: { name: 'Latam', flag: '🇲🇽' },
  vn: { name: 'Vietnam', flag: '🇻🇳' },
};
// ===== END CONFIGURATION =====

const app = express();
app.use(bodyParser.json());

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
const lastEvents = Object.fromEntries(Object.keys(REGIONS).map(region => [region, []]));

// Utility to validate URLs
const isValidUrl = (url) => {
  return url && (url.startsWith('http://') || url.startsWith('https://'));
};

// Fetch events for a region
const fetchEvents = async (region) => {
  try {
    const response = await axios.get(API_URL.replace('{region}', region), { timeout: 10000 });
    return response.status === 200 ? response.data : [];
  } catch (error) {
    console.error(`Error fetching events for ${region}:`, error.message);
    return [];
  }
};

// Check for new events
const checkNewEvents = async () => {
  for (const region in REGIONS) {
    const current = await fetchEvents(region);
    const newEvents = current.filter(event => !lastEvents[region].some(e => JSON.stringify(e) === JSON.stringify(event)));

    for (const event of newEvents) {
      await sendAlert(region, event);
    }

    lastEvents[region] = current;
  }
};

// Send alert for new event
const sendAlert = async (region, event) => {
  const message = [
    '🚀 NEW BANNER',
    `🏷️ ${event.title || 'Untitled'}`,
    `📍 ${REGIONS[region].flag} ${REGIONS[region].name}`,
    `🔗 ${event.url || 'No link'}`
  ].join('\n');

  await bot.sendMessage(GROUP_ID, message);

  if (isValidUrl(event.redirect)) {
    await bot.sendDocument(GROUP_ID, event.redirect, {}, {
      filename: `${region}_banner.jpg`,
      contentType: 'image/jpeg'
    });
  }
};

// Telegram command handlers
bot.onText(/\/splash(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const region = match[1]?.toLowerCase();

  if (!region) {
    await bot.sendMessage(chatId, 'Usage: /splash [region_code]');
    return;
  }

  if (REGIONS[region]) {
    const events = await fetchEvents(region);
    await bot.sendMessage(chatId, `Found ${events.length} banners in ${REGIONS[region].name}`);
  } else {
    await bot.sendMessage(chatId, '❌ Invalid region. Use /list');
  }
});

bot.onText(/\/list/, async (msg) => {
  const chatId = msg.chat.id;
  const regions = Object.entries(REGIONS)
    .map(([code, info]) => `${code}: ${info.flag} ${info.name}`)
    .join('\n');
  await bot.sendMessage(chatId, `Available regions:\n${regions}`);
});

// Webhook endpoints
app.get('/set_webhook', async (req, res) => {
  const webhookUrl = `https://${req.headers.host}/webhook`;
  try {
    await bot.setWebHook(webhookUrl);
    res.send(`Webhook set to ${webhookUrl}`);
  } catch (error) {
    res.status(500).send('Failed to set webhook');
  }
});

app.post('/webhook', (req, res) => {
  bot.processUpdate(req.body);
  res.send('ok');
});

app.get('/check_events', async (req, res) => {
  await checkNewEvents();
  res.send('Checked for new events');
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
