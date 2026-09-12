const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

async function main() {
  try {
    const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mclive';
    console.log('🔗 Connecting to:', uri);
    
    await mongoose.connect(uri);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();

    console.log('═══════════════════════════════');
    console.log('📁 ALL COLLECTIONS:');
    console.log('═══════════════════════════════');
    
    for (const col of collections) {
      const count = await db.collection(col.name).countDocuments();
      console.log(`  ${col.name} → ${count} documents`);
    }

    console.log('\n═══════════════════════════════');
    console.log('🔍 SOS COLLECTION SAMPLE:');
    console.log('═══════════════════════════════');
    
    const sosCollections = collections.filter(c => 
      c.name.toLowerCase().includes('sos')
    );
    
    for (const sosCol of sosCollections) {
      const sample = await db.collection(sosCol.name).findOne();
      if (sample) {
        console.log(`\n📌 Collection: ${sosCol.name}`);
        console.log(JSON.stringify(sample, null, 2));
      }
    }

    console.log('\n═══════════════════════════════');
    console.log('🎵 AUDIO SEARCH:');
    console.log('═══════════════════════════════');
    
    for (const col of collections) {
      try {
        const audioDoc = await db.collection(col.name).findOne({
          $or: [
            { 'components.audio': { $exists: true } },
            { type: 'audio' },
            { mediaType: 'audio' },
          ]
        });
        if (audioDoc) {
          console.log(`\n✅ AUDIO FOUND in collection: ${col.name}`);
          console.log(JSON.stringify(audioDoc, null, 2));
        }
      } catch (e) {
        // skip
      }
    }

    console.log('\n✅ Done');
    await mongoose.disconnect();

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();
