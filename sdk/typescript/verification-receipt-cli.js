#!/usr/bin/env node
const fs = require('node:fs');
const vr = require('./verification-receipt');
const [command, receiptPath, profilePath] = process.argv.slice(2);
const commands = { derive: vr.deriveVerificationReceipt, 'prepare-anchor': vr.prepareVerificationAnchor, 'prepare-attestation': vr.prepareVerificationAttestation, 'validate-profile': vr.validateReceiptProfile };
if (!Object.hasOwn(commands, command) || !receiptPath || (command === 'validate-profile' && !profilePath)) {
  throw new Error('Usage: verification-receipt-cli.js <derive|prepare-anchor|prepare-attestation|validate-profile> receipt.json [profile.json]');
}
const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
const profile = profilePath ? JSON.parse(fs.readFileSync(profilePath, 'utf8')) : undefined;
console.log(JSON.stringify(commands[command](receipt, profile)));
