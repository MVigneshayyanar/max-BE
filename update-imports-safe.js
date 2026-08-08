const fs = require('fs');
const path = require('path');

const libDir = 'c:\\max-my-bill-1\\lib';

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    const dirPath = path.join(dir, f);
    const isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) {
      walkDir(dirPath, callback);
    } else if (f.endsWith('.dart') && f !== 'firestore_compat.dart') {
      callback(dirPath);
    }
  });
}

let updatedCount = 0;

walkDir(libDir, (filePath) => {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const oldImport = "import 'package:cloud_firestore/cloud_firestore.dart';";
    const newImport = "import 'package:maxmybill/utils/firestore_compat.dart';";

    if (content.includes(oldImport)) {
      content = content.replaceAll(oldImport, newImport);
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✅ Updated: ${path.relative(libDir, filePath)}`);
      updatedCount++;
    }
  } catch (err) {
    console.error(`❌ Error updating ${filePath}:`, err.message);
  }
});

console.log(`\n🎉 Safe update completed! ${updatedCount} files updated.`);
