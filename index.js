import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { ethers } from 'ethers';

// تهيئة البيئة
dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// 1. MIDDLEWARE
// ============================================
app.use(express.json());

// ============================================
// 2. إعدادات Alchemy و Blockchain
// ============================================
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const SOURCE_WALLET = process.env.SOURCE_WALLET || "0x16eD6dCdC283FCEc179272fFb9d6F2C4Dd178984";
const RECEIVER_WALLET = process.env.RECEIVER_WALLET || "0xBA19eF26007d129BfB9063aCD9c400f9aCf054C7";
const USDT_CONTRACT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";

// إنشاء Provider و Wallet
let provider, wallet;
if (ALCHEMY_API_KEY) {
    provider = new ethers.JsonRpcProvider(`https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`);
    if (PRIVATE_KEY) {
        wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    }
}

// ============================================
// 3. المسار الرئيسي: عرض بيانات JSON
// ============================================
app.get('/', (req, res) => {
    try {
        const filePath = path.join(__dirname, 'transaction_data.json');
        const data = fs.readFileSync(filePath, 'utf8');
        const jsonData = JSON.parse(data);
        res.json({
            status: 'success',
            message: '✅ JSON Viewer is working with real data',
            data: jsonData
        });
    } catch (err) {
        res.status(500).json({
            status: 'error',
            message: 'File not found or invalid JSON',
            details: err.message
        });
    }
});

// ============================================
// 4. مسار عرض معلومات التكوين
// ============================================
app.get('/config', (req, res) => {
    res.json({
        sourceWallet: SOURCE_WALLET,
        receiverWallet: RECEIVER_WALLET,
        usdtContract: USDT_CONTRACT,
        alchemyConfigured: !!ALCHEMY_API_KEY,
        walletConfigured: !!PRIVATE_KEY
    });
});

// ============================================
// 5. مسار قراءة رصيد المحفظة (USDT و ETH)
// ============================================
app.get('/balance/:address?', async (req, res) => {
    try {
        if (!provider) {
            return res.status(400).json({ error: 'Alchemy API Key not configured' });
        }
        
        const address = req.params.address || SOURCE_WALLET;
        
        // رصيد ETH
        const ethBalance = await provider.getBalance(address);
        
        // رصيد USDT
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

// ============================================
// 6. مسار تحويل USDT (Wallet-to-Wallet)
// ============================================
app.post('/transfer', async (req, res) => {
    try {
        const { to, amount, from } = req.body;
        
        if (!wallet) {
            return res.status(400).json({ error: 'Wallet not configured (missing PRIVATE_KEY)' });
        }
        
        if (!to || !amount) {
            return res.status(400).json({ error: 'Missing required fields: to, amount' });
        }
        
        // التحقق من صحة العنوان
        if (!ethers.isAddress(to)) {
            return res.status(400).json({ error: 'Invalid recipient address' });
        }
        
        // إنشاء واجهة USDT
        const usdtAbi = [
            "function transfer(address to, uint256 amount) returns (bool)",
            "function decimals() view returns (uint8)"
        ];
        const usdt = new ethers.Contract(USDT_CONTRACT, usdtAbi, wallet);
        const decimals = await usdt.decimals();
        
        // تحويل المبلغ إلى أصغر وحدة
        const amountInWei = ethers.parseUnits(amount.toString(), decimals);
        
        console.log(`📤 Initiating transfer of ${amount} USDT to ${to}`);
        
        // إرسال المعاملة
        const tx = await usdt.transfer(to, amountInWei);
        console.log(`📨 Transaction hash: ${tx.hash}`);
        
        // انتظار التأكيد (اختياري)
        const receipt = await tx.wait();
        
        res.json({
            status: 'success',
            message: 'Transfer initiated successfully',
            txHash: tx.hash,
            blockNumber: receipt.blockNumber,
            gasUsed: receipt.gasUsed.toString(),
            from: wallet.address,
            to: to,
            amount: amount
        });
    } catch (err) {
        console.error('❌ Transfer error:', err);
        res.status(500).json({
            status: 'error',
            message: err.message,
            details: err.code || 'Unknown error'
        });
    }
});

// ============================================
// 7. مسار اختبار (للتحقق من التطبيق)
// ============================================
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// ============================================
// 8. تشغيل الخادم
// ============================================
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📌 Source Wallet: ${SOURCE_WALLET}`);
    console.log(`📌 Receiver Wallet: ${RECEIVER_WALLET}`);
    console.log(`🔑 Alchemy: ${ALCHEMY_API_KEY ? '✅ Configured' : '❌ Not configured'}`);
    console.log(`🔑 Private Key: ${PRIVATE_KEY ? '✅ Configured' : '❌ Not configured'}`);
});
