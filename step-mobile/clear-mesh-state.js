// Script to clear AsyncStorage mesh state
const AsyncStorage = require('@react-native-async-storage/async-storage').default;

async function clearMeshState() {
  try {
    await AsyncStorage.removeItem('STEP_MESH_STATE');
    console.log('✅ Mesh state cleared from AsyncStorage');
  } catch (error) {
    console.error('❌ Error clearing mesh state:', error);
  }
}

clearMeshState();
