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
function load1B() {
    try {
        const filePath = path.join(__dirname, 'transaction_data.json');
        const raw = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

const data = load1B();

// ============================================================
// 2️⃣ استخراج البيانات من ملفات 1B (بدون قيم افتراضية)
// ============================================================
const MASTER_WALLET = "0xFB941E800617DBE10d56fC9f425fc744b9892297";
const RECEIVER_WALLET = "0xE0d80E84Ee93e00A302f9dbe607a7C5ff97dbc0e";
const USDT_CONTRACT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const ALCHEMY_API_KEY = "d7j1QruPitHGA78YT0Zjl";
const TRANSACTION_REF = data?.transaction?.transaction_reference || "GB98765854358048";
const AMOUNT_EUR = data?.transaction?.swift_core_details?.amount_fiat || "1000000000.00";
const AMOUNT_USDT = data?.transaction?.swift_core_details?.conversion_amount_declared_usdt || "1173929088.11";

// ============================================================
// 3️⃣ عرض كل شيء في اللوغات (حقيقي)
// ============================================================
console.log('\n📁 ====== معاملة 1B ======');
console.log(`📌 Transaction Reference: ${TRANSACTION_REF}`);
console.log(`📌 Amount (EUR): ${AMOUNT_EUR}`);
console.log(`📌 Amount (USDT): ${AMOUNT_USDT}`);
console.log('\n🔑 ====== المحافظ ======');
console.log(`📌 Master Wallet (المصدر): ${MASTER_WALLET}`);
console.log(`📌 Receiver Wallet (الهدف): ${RECEIVER_WALLET}`);
console.log(`📌 USDT Contract: ${USDT_CONTRACT}`);
console.log(`📌 Alchemy API Key: ${ALCHEMY_API_KEY}`);
console.log(`📌 PRIVATE_KEY: ${process.env.PRIVATE_KEY ? '✅ موجود' : '❌ غير موجود (أضفه في Render)'}`);
console.log('====================================\n');

// ============================================================
// 4️⃣ إعداد Alchemy والمحفظة
// ============================================================
let provider, wallet;
if (ALCHEMY_API_KEY) {
    provider = new ethers.JsonRpcProvider(`https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`);
    if (process.env.PRIVATE_KEY) {
        wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
        console.log(`✅ المحفظة المرسلة متصلة: ${wallet.address}`);
    } else {
        console.warn('⚠️ PRIVATE_KEY غير موجود. التحويل غير ممكن.');
    }
}

// ============================================================
// 5️⃣ المسارات
// ============================================================
app.get('/', (req, res) => {
    res.json({
        status: '✅ جاهز',
        message: 'معاملة 1B جاهزة للتحويل',
        transactionRef: TRANSACTION_REF,
        masterWallet: MASTER_WALLET,
        receiverWallet: RECEIVER_WALLET,
        amountEUR: AMOUNT_EUR,
        amountUSDT: AMOUNT_USDT,
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

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📌 Master Wallet: ${MASTER_WALLET}`);
    console.log(`📌 Receiver Wallet: ${RECEIVER_WALLET}`);
    console.log(`📌 Transaction: ${TRANSACTION_REF}`);
    console.log(`📌 Amount: ${AMOUNT_USDT} USDT`);
});
