import { getTriangleAt } from '../core/mesh/geometry.js';
import { connectDB, Triangle } from '../core/db/index.js';

async function generateMesh() {
  console.log('Connecting to DB...');
  await connectDB();
  
  console.log('Generating level 10 mesh for San Francisco area...');
  
  // SF coordinates
  const lat = 37.785834;
  const lon = -122.406417;
  
  // Get triangle at level 10
  const tri = await getTriangleAt(lat, lon, 10);
  console.log('Found triangle:', tri.triangleId);
  console.log('Centroid:', tri.centroid.coordinates);
  
  // Insert into DB
  const existing = await Triangle.findOne({ triangleId: tri.triangleId });
  if (existing) {
    console.log('✓ Triangle already exists in DB');
  } else {
    console.log('✗ Triangle NOT in DB - inserting...');
    await Triangle.create(tri);
    console.log('✓ Inserted');
  }
  
  // Generate a few neighbors for visualization
  console.log('\nGenerating nearby triangles...');
  const nearby: any[] = [];
  
  // Generate a grid of points around SF
  for (let latOffset = -0.5; latOffset <= 0.5; latOffset += 0.1) {
    for (let lonOffset = -0.5; lonOffset <= 0.5; lonOffset += 0.1) {
      const testLat = lat + latOffset;
      const testLon = lon + lonOffset;
      const testTri = await getTriangleAt(testLat, testLon, 10);
      
      // Check if we already have this triangle
      if (!nearby.find(t => t.triangleId === testTri.triangleId)) {
        nearby.push(testTri);
      }
    }
  }
  
  console.log(`Found ${nearby.length} unique triangles`);
  
  // Insert all
  for (const tri of nearby) {
    await Triangle.updateOne(
      { triangleId: tri.triangleId },
      { $set: tri },
      { upsert: true }
    );
  }
  
  console.log(`✓ Upserted ${nearby.length} triangles`);
  
  // Verify
  const count = await Triangle.countDocuments({ level: 10 });
  console.log(`\nTotal level 10 triangles in DB: ${count}`);
  
  process.exit(0);
}

generateMesh().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
