import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: 'https://nightcoremaker.online'
}));
app.use(express.json());

const PATREON_AUTH_URL = 'https://www.patreon.com/oauth2/authorize';
const PATREON_TOKEN_URL = 'https://www.patreon.com/api/oauth2/token';

app.get('/auth/patreon', (req, res) => {
  const redirectUri = encodeURIComponent(process.env.PATREON_REDIRECT_URI);
  const clientId = process.env.PATREON_CLIENT_ID;
  
  // URL de autorización de Patreon v2 con scopes 'identity' y 'identity.memberships'
  const url = `${PATREON_AUTH_URL}?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=identity identity.memberships`;
  res.redirect(url);
});

app.get('/auth/callback', async (req, res) => {
  const code = req.query.code;
  
  if (!code) {
    return res.status(400).send('No code provided');
  }

  try {
    // Intercambiar código por access_token
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      client_id: process.env.PATREON_CLIENT_ID,
      client_secret: process.env.PATREON_CLIENT_SECRET,
      redirect_uri: process.env.PATREON_REDIRECT_URI
    });

    const tokenResponse = await axios.post(PATREON_TOKEN_URL, tokenParams.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const accessToken = tokenResponse.data.access_token;

    // Obtener identidad del usuario y sus membresías
    const userResponse = await axios.get('https://www.patreon.com/api/oauth2/v2/identity?include=memberships,memberships.currently_entitled_tiers', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const includedData = userResponse.data.included || [];
    let isPremium = false;
    const premiumTierId = process.env.PATREON_TIER_ID;

    console.log("\n=== DATOS DE PATREON ===");
    console.log("Tiers encontrados en tu cuenta:");
    includedData.forEach(item => {
      if (item.type === 'tier') {
        console.log(`- ID del Tier: ${item.id}`);
      }
    });
    console.log(`Tier ID requerido (.env): ${premiumTierId}\n`);

    // Revisar si el usuario está activamente suscrito
    for (const item of includedData) {
      if (item.type === 'tier' && item.id === premiumTierId) {
        isPremium = true;
        break;
      }
    }

    // Redireccionar según si es premium o no
    if (isPremium) {
      res.send(`<script>window.opener.postMessage("patreon_success", "https://nightcoremaker.online"); window.close();</script>`);
    } else {
      res.redirect('https://www.patreon.com/c/FrankszkyNightcore/membership');
    }

  } catch (error) {
    console.error('Error during Patreon auth:', error.response?.data || error.message);
    // Redireccionar a Patreon en caso de error o código inválido
    res.redirect('https://www.patreon.com/c/FrankszkyNightcore/membership');
  }
});

app.listen(PORT, () => {
  console.log(`Servidor Backend corriendo en http://localhost:${PORT}`);
});
