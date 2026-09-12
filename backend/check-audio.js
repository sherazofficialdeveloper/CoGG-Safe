const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    const db = mongoose.connection.db;
    
    const sos = await db.collection('sos').findOne({
      _id: new mongoose.Types.ObjectId('6aa43f1183fa49960f021775')
    });
    
    console.log('=== SOS ===');
    console.log('Status:', sos.status);
    console.log('Token:', sos.emergencyToken);
    console.log('');
    
    console.log('=== COMPONENTS ===');
    console.log(JSON.stringify(sos.components, null, 2));
    console.log('');
    
    console.log('=== AUDIO ===');
    console.log('Audio component:', sos.components?.audio);
    console.log('Storage ref:', sos.components?.audio?.storageRef);
    console.log('Status:', sos.components?.audio?.status);
    console.log('');
    
    console.log('=== LOCATION ===');
    console.log(JSON.stringify(sos.location, null, 2));
    console.log('');
    
    console.log('=== LIVE LOCATION ===');
    console.log(JSON.stringify(sos.liveLocation, null, 2));
    
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
