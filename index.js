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

// ============================================================
// 1️⃣ تحميل ملف 1B JSON
// ============================================================
function loadData() {
    try {
        const filePath = path.join(__dirname, 'transaction_data.json');
        const raw = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

const data = loadData();

// ============================================================
// 2️⃣ استخراج البيانات من 1B (بدون أي قيم افتراضية)
// ============================================================
const MASTER_WALLET = data?.transaction?.swift_core_details?.sender_iban || "0x16eD6dCdC283FCEc179272fFb9d6F2C4Dd178984";
const RECEIVER_WALLET = data?.transaction?.swift_core_details?.receiver_account_number || "0x17eEB294d4c0E17B05B3357a335FEEB549e784FB";
const USDT_CONTRACT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const ALCHEMY_API_KEY = "d7j1QruPitHGA78YT0Zjl";
const PRIVATE_KEY = process.env.PRIVATE_KEY; // يجب إضافته في Render

// ============================================================
// 3️⃣ عرض كل شيء في اللوغات
// ============================================================
console.log('\n📁 ====== ملف 1B ======');
console.log(JSON.stringify(data, null, 2));
console.log('\n🔑 ====== المفاتيح المستخرجة ======');
console.log(`📌 Master Wallet (المصدر): ${MASTER_WALLET}`);
console.log(`📌 Receiver Wallet (الهدف): ${RECEIVER_WALLET}`);
console.log(`📌 USDT Contract: ${USDT_CONTRACT}`);
console.log(`📌 Alchemy API Key: ${ALCHEMY_API_KEY}`);
console.log(`📌 PRIVATE_KEY: ${PRIVATE_KEY ? '✅ موجود' : '❌ غير موجود (أضفه في Render)'}`);
console.log('====================================\n');

// ============================================================
// 4️⃣ إعداد Alchemy والمحفظة
// ============================================================
let provider, wallet;
if (ALCHEMY_API_KEY) {
    provider = new ethers.JsonRpcProvider(`https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`);
    if (PRIVATE_KEY) {
        wallet = new ethers.Wallet(PRIVATE_KEY, provider);
        console.log(`✅ المحفظة المرسلة متصلة: ${wallet.address}`);
    } else {
        console.warn('⚠️ PRIVATE_KEY غير موجود. التحويل غير ممكن.');
    }
}

// ============================================================
// 5️⃣ المسارات (Routes)
// ============================================================
app.get('/', (req, res) => {
    res.json({
        status: '✅ جاهز',
        message: 'ملف 1B تم تحميله',
        masterWallet: MASTER_WALLET,
        receiverWallet: RECEIVER_WALLET,
        data: data
    });
});

app.get('/balance/:address?', async (req, res) => {
    try {
        if (!provider) return res.status(400).json({ error: 'Alchemy not configured' });
        const address = req.params.address || MASTER_WALLET;
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

app.post('/transfer', async (req, res) => {
    try {
        const { to, amount, confirm } = req.body;

        if (!to || !amount) return res.status(400).json({ error: 'Missing to or amount' });
        if (!ethers.isAddress(to)) return res.status(400).json({ error: 'Invalid address' });
        if (!wallet) return res.status(400).json({ error: 'PRIVATE_KEY not configured' });
        if (confirm !== 'YES') return res.status(400).json({ error: 'Set confirm: "YES"' });

        const usdtAbi = [
            "function transfer(address to, uint256 amount) returns (bool)",
            "function decimals() view returns (uint8)",
            "function balanceOf(address) view returns (uint256)"
        ];
        const usdt = new ethers.Contract(USDT_CONTRACT, usdtAbi, wallet);
        const decimals = await usdt.decimals();
        const balance = await usdt.balanceOf(wallet.address);
        const amountInWei = ethers.parseUnits(amount.toString(), decimals);
        const balanceWei = ethers.parseUnits(balance.toString(), decimals);

        if (amountInWei > balanceWei) {
            return res.status(400).json({
                error: 'Insufficient USDT balance',
                balance: ethers.formatUnits(balance, decimals)
            });
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
        console.error('❌ Transfer error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// ============================================================
// 6️⃣ تشغيل الخادم
// ============================================================
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📌 Master Wallet: ${MASTER_WALLET}`);
    console.log(`📌 Receiver Wallet: ${RECEIVER_WALLET}`);
});
