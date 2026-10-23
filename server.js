const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper functions for IP conversion
function ipToInt(ip) {
    return ip.split('.').reduce((acc, octet) => ((acc << 8) + parseInt(octet, 10)), 0) >>> 0;
}

function intToIp(int) {
    return [(int >>> 24) & 255, (int >>> 16) & 255, (int >>> 8) & 255, int & 255].join('.');
}

// Subnet Calculation API Endpoint
app.post('/api/calculate', (req, res) => {
    const { ip, cidr } = req.body;

    if (!ip || !cidr) {
        return res.status(400).json({ error: 'IP address and CIDR prefix are required.' });
    }

    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(ip)) {
        return res.status(400).json({ error: 'Invalid IP address format.' });
    }

    const cidrNum = parseInt(cidr, 10);
    if (isNaN(cidrNum) || cidrNum < 0 || cidrNum > 32) {
        return res.status(400).json({ error: 'Invalid CIDR prefix (must be 0-32).' });
    }

    try {
        const ipInt = ipToInt(ip);
        const maskInt = cidrNum === 0 ? 0 : (~((1 << (32 - cidrNum)) - 1)) >>> 0;
        const netInt = (ipInt & maskInt) >>> 0;
        const wildcardInt = (~maskInt) >>> 0;
        const broadcastInt = (netInt | wildcardInt) >>> 0;

        let firstHostInt = netInt;
        let lastHostInt = broadcastInt;
        let totalHosts = wildcardInt + 1;
        let usableHosts = totalHosts > 2 ? totalHosts - 2 : (totalHosts === 2 ? 0 : totalHosts);

        if (cidrNum === 31) {
            usableHosts = 2;
        } else if (cidrNum === 32) {
            usableHosts = 1;
        } else if (totalHosts > 2) {
            firstHostInt = netInt + 1;
            lastHostInt = broadcastInt - 1;
        }

        const subnetMask = intToIp(maskInt);
        const networkAddress = intToIp(netInt);
        const broadcastAddress = intToIp(broadcastInt);
        const firstHost = intToIp(firstHostInt);
        const lastHost = intToIp(lastHostInt);
        const magicNumber = 256 - parseInt(subnetMask.split('.').pop(), 10);

        // IP Class & Type determination
        const parts = ip.split('.').map(Number);
        const first = parts[0];

        let ipClass = 'Standard';
        if (first >= 1 && first <= 126) ipClass = 'Class A';
        else if (first >= 128 && first <= 191) ipClass = 'Class B';
        else if (first >= 192 && first <= 223) ipClass = 'Class C';
        else if (first >= 224 && first <= 239) ipClass = 'Class D (Multicast)';

        let ipType = 'Public';
        if (first === 10 || (first === 172 && parts[1] >= 16 && parts[1] <= 31) || (first === 192 && parts[1] === 168)) {
            ipType = 'Private (RFC 1918)';
        } else if (first === 127) {
            ipType = 'Loopback';
        }

        res.json({
            subnetMask,
            magicNumber,
            networkAddress,
            broadcastAddress,
            firstHost,
            lastHost,
            totalHosts,
            usableHosts,
            ipClass,
            ipType
        });
    } catch (err) {
        res.status(500).json({ error: 'Calculation error occurred on server.' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});