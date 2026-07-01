import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { ethers } from 'ethers';

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());

// ===== متغيرات البيئة =====
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const SOURCE_WALLET = process.env.SOURCE_WALLET || "0x16eD6dCdC283FCEc179272fFb9d6F2C4Dd178984";
const RECEIVER_WALLET = process.env.RECEIVER_WALLET || "0x17eEB294d4c0E17B05B3357a335FEEB549e784FB";
const USDT_CONTRACT = process.env.USDT_CONTRACT || "0xdAC17F958D2ee523a2206206994597C13D831ec7";

let provider, wallet;
if (ALCHEMY_API_KEY) {
    provider = new ethers.JsonRpcProvider(`https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`);
    if (PRIVATE_KEY) {
        wallet = new ethers.Wallet(PRIVATE_KEY, provider);
        console.log(`✅ المحفظة المرسلة: ${wallet.address}`);
    } else {
        console.log('⚠️ PRIVATE_KEY غير موجود، يمكنك فقط قراءة البيانات.');
    }
} else {
    console.log('❌ ALCHEMY_API_KEY غير موجود.');
}

// ===== قراءة ملف JSON =====
function getTransactionData() {
    try {
        const filePath = path.join(__dirname, 'transaction_data.json');
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch {
        return null;
    }
}

// ===== المسار الرئيسي =====
app.get('/', (req, res) => {
    const data = getTransactionData();
    if (data) {
        res.json({ status: 'success', message: '✅ بيانات المعاملة', data });
    } else {
        res.json({
            status: 'success',
            message: '✅ JSON Viewer يعمل (بيانات تجريبية)',
            note: 'يرجى رفع transaction_data.json',
            config: {
                sourceWallet: SOURCE_WALLET,
                receiverWallet: RECEIVER_WALLET,
                alchemyConfigured: !!ALCHEMY_API_KEY,
                walletConfigured: !!PRIVATE_KEY
            }
        });
    }
});

// ===== معلومات التكوين =====
app.get('/config', (req, res) => {
    res.json({
        sourceWallet: SOURCE_WALLET,
        receiverWallet: RECEIVER_WALLET,
        usdtContract: USDT_CONTRACT,
        alchemyConfigured: !!ALCHEMY_API_KEY,
        walletConfigured: !!PRIVATE_KEY
    });
});

// ===== رصيد المحفظة =====
app.get('/balance/:address?', async (req, res) => {
    try {
        if (!provider) return res.status(400).json({ error: 'Alchemy not configured' });
        const address = req.params.address || SOURCE_WALLET;
        if (!ethers.isAddress(address)) return res.status(400).json({ error: 'Invalid address' });

        const ethBalance = await provider.getBalance(address);
        const usdtAbi = [
            "function balanceOf(address) view returns (uint256)",
            "function decimals() view returns (uint8)"
        ];
        const usdt = new ethers.Contract(USDT_CONTRACT, usdtAbi, provider);
        const decimals = await usdt.decimals();
        const usdtBalance = await usdt.balanceOf(address);

        res.json({
            address,
            eth: ethers.formatEther(ethBalance),
            usdt: ethers.formatUnits(usdtBalance, decimals),
            usdtDecimals: decimals
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===== تحويل USDT (مع تأكيد) =====
app.post('/transfer', async (req, res) => {
    try {
        const { to, amount, confirm } = req.body;
        if (!to || !amount) return res.status(400).json({ error: 'Missing to or amount' });
        if (!ethers.isAddress(to)) return res.status(400).json({ error: 'Invalid address' });
        if (!wallet) return res.status(400).json({ error: 'PRIVATE_KEY not configured' });
        if (confirm !== 'YES') return res.status(400).json({ error: 'Please set confirm: "YES"' });

        const usdtAbi = [
            "function transfer(address to, uint256 amount) returns (bool)",
            "function decimals() view returns (uint8)",
            "function balanceOf(address) view returns (uint256)"
        ];
        const usdt = new ethers.Contract(USDT_CONTRACT, usdtAbi, wallet);
        const decimals = await usdt.decimals();
        const balance = await usdt.balanceOf(wallet.address);
        const amountInWei = ethers.parseUnits(amount.toString(), decimals);
        if (amountInWei.gt(balance)) {
            return res.status(400).json({ error: 'Insufficient balance', balance: ethers.formatUnits(balance, decimals) });
        }

        console.log(`📤 إرسال ${amount} USDT إلى ${to}`);
        const tx = await usdt.transfer(to, amountInWei);
        console.log(`📨 هاش: ${tx.hash}`);
        const receipt = await tx.wait();

        res.json({
            status: 'success',
            txHash: tx.hash,
            blockNumber: receipt.blockNumber,
            from: wallet.address,
            to,
            amount,
            explorerUrl: `https://etherscan.io/tx/${tx.hash}`
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===== مسار محاكاة (للتدريب) =====
app.post('/simulate-transfer', (req, res) => {
    const { to, amount } = req.body;
    res.json({
        status: 'simulation',
        message: 'هذه محاكاة للتحويل (للتدريب فقط)',
        from: SOURCE_WALLET,
        to: to || RECEIVER_WALLET,
        amount: amount || '0',
        note: 'لتنفيذ تحويل حقيقي، استخدم /transfer مع confirm: "YES"'
    });
});

// ===== التحقق من الصحة =====
app.get('/health', (req, res) => res.json({ status: 'healthy', timestamp: new Date().toISOString() }));

// ===== تشغيل الخادم =====
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📌 SOURCE_WALLET: ${SOURCE_WALLET}`);
    console.log(`📌 RECEIVER_WALLET: ${RECEIVER_WALLET}`);
    console.log(`🔑 Alchemy: ${ALCHEMY_API_KEY ? '✅' : '❌'}`);
    console.log(`🔑 Private Key: ${PRIVATE_KEY ? '✅' : '❌'}`);
});
