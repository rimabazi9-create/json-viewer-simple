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
// 1️⃣ تحميل ملف JSON وعرض محتواه في اللوغات
// ============================================================
function loadAndLogTransactionData() {
    try {
        const filePath = path.join(__dirname, 'transaction_data.json');
        const raw = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(raw);

        console.log('\n📁 ====== بيانات المعاملة (من ملف JSON) ======');
        console.log(JSON.stringify(data, null, 2));
        console.log('================================================\n');

        return data;
    } catch (err) {
        console.error('❌ فشل قراءة ملف JSON:', err.message);
        return null;
    }
}

const txData = loadAndLogTransactionData();

// ============================================================
// 2️⃣ استخراج المفاتيح من الـ JSON وعرضها في اللوغات
// ============================================================
function extractKeys(data) {
    if (!data) return null;

    // محاولة استخراج المفاتيح من أماكنها المختلفة في الـ JSON
    const masterWallet = data?.transaction?.swift_core_details?.sender_iban ||
                         data?.transaction?.sender_iban ||
                         data?.master_wallet ||
                         data?.wallet?.master ||
                         data?.receiver?.master_wallet ||
                         process.env.SOURCE_WALLET ||
                         "0xFB941E800617DBE10d56fC9f425fc744b9892297";

    const receiverWallet = data?.transaction?.swift_core_details?.receiver_account_number ||
                           data?.transaction?.receiver_account ||
                           data?.receiver_wallet ||
                           data?.wallet?.receiver ||
                           process.env.RECEIVER_WALLET ||
                           "0xE0d80E84Ee93e00A302f9dbe607a7C5ff97dbc0e";

    const usdtContract = data?.transaction?.swift_core_details?.usdt_contract ||
                         data?.usdt_contract ||
                         "0xdAC17F958D2ee523a2206206994597C13D831ec7";

    const alchemyKey = data?.alchemy?.api_key ||
                       process.env.ALCHEMY_API_KEY ||
                       "d7j1QruPitHGA78YT0Zjl";

    const transactionRef = data?.transaction?.transaction_reference ||
                           data?.reference ||
                           "غير موجود";

    return {
        masterWallet,
        receiverWallet,
        usdtContract,
        alchemyKey,
        transactionRef,
        transactionType: data?.transaction?.transaction_type || data?.type || "غير محدد"
    };
}

const keys = extractKeys(txData);

// عرض المفاتيح المستخرجة في اللوغات
if (keys) {
    console.log('\n🔑 ====== المفاتيح المستخرجة من ملف JSON ======');
    console.log(`📌 Transaction Reference: ${keys.transactionRef}`);
    console.log(`📌 Master Wallet (المصدر): ${keys.masterWallet}`);
    console.log(`📌 Receiver Wallet (الوجهة): ${keys.receiverWallet}`);
    console.log(`📌 USDT Contract: ${keys.usdtContract}`);
    console.log(`📌 Alchemy API Key: ${keys.alchemyKey ? '✅ موجود' : '❌ غير موجود'}`);
    console.log(`📌 Transaction Type: ${keys.transactionType}`);
    console.log('================================================\n');
} else {
    console.warn('⚠️ لم نتمكن من استخراج المفاتيح من ملف JSON.');
}

// ============================================================
// 3️⃣ إعداد Alchemy والمحفظة
// ============================================================
const ALCHEMY_API_KEY = keys?.alchemyKey || process.env.ALCHEMY_API_KEY;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const MASTER_WALLET = keys?.masterWallet || process.env.SOURCE_WALLET;
const RECEIVER_WALLET = keys?.receiverWallet || process.env.RECEIVER_WALLET;
const USDT_CONTRACT = keys?.usdtContract || "0xdAC17F958D2ee523a2206206994597C13D831ec7";

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
// 4️⃣ المسارات (Routes)
// ============================================================
app.get('/', (req, res) => {
    if (txData) {
        res.json({
            status: '✅ جاهز',
            message: 'تم تحميل ملف المعاملة بنجاح',
            extractedKeys: keys,
            fullData: txData
        });
    } else {
        res.json({
            status: '⚠️ تنبيه',
            message: 'ملف transaction_data.json غير موجود'
        });
    }
});

app.get('/config', (req, res) => {
    res.json({
        masterWallet: MASTER_WALLET,
        receiverWallet: RECEIVER_WALLET,
        usdtContract: USDT_CONTRACT,
        alchemyConfigured: !!ALCHEMY_API_KEY,
        walletConfigured: !!PRIVATE_KEY,
        transactionRef: keys?.transactionRef || 'غير موجود'
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
        console.log(`📨 هاش المعاملة: ${tx.hash}`);
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

app.post('/simulate', (req, res) => {
    const { to, amount } = req.body;
    res.json({
        status: 'simulation',
        message: 'محاكاة تحويل (للتدريب فقط)',
        from: MASTER_WALLET,
        to: to || RECEIVER_WALLET,
        amount: amount || '0',
        note: 'للتحويل الحقيقي استخدم /transfer مع confirm: "YES"'
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// ============================================================
// 5️⃣ تشغيل الخادم
// ============================================================
app.listen(PORT, () => {
    console.log(`\n🚀 Server running on port ${PORT}`);
    console.log(`📌 Master Wallet: ${MASTER_WALLET}`);
    console.log(`📌 Receiver Wallet: ${RECEIVER_WALLET}`);
    console.log(`📌 Transaction Ref: ${keys?.transactionRef || 'غير موجود'}`);
    console.log(`🔑 Alchemy: ${ALCHEMY_API_KEY ? '✅' : '❌'}`);
    console.log(`🔑 Private Key: ${PRIVATE_KEY ? '✅' : '❌'}\n`);
});
