// =========================================================
// Base de datos local (IndexedDB) — todo se guarda en el iPhone
// =========================================================

const DB_NAME = 'gymfit';
const DB_VERSION = 4;
let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('workouts')) {
        db.createObjectStore('workouts', { keyPath: 'date' });
      }
      if (!db.objectStoreNames.contains('meals')) {
        const s = db.createObjectStore('meals', { keyPath: 'id', autoIncrement: true });
        s.createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains('routines')) {
        db.createObjectStore('routines', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('sessions')) {
        const s = db.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true });
        s.createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains('weights')) {
        db.createObjectStore('weights', { keyPath: 'date' });   // una pesada por día
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

// Ejecuta una operación y devuelve su resultado cuando la transacción termina
async function run(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const db = {
  // Entrenamientos
  allWorkouts: () => run('workouts', 'readonly', s => s.getAll()),
  putWorkout: w => run('workouts', 'readwrite', s => s.put(w)),
  deleteWorkout: date => run('workouts', 'readwrite', s => s.delete(date)),

  // Comidas
  mealsByDate: date => run('meals', 'readonly', s => s.index('date').getAll(date)),
  mealsBetween: (from, to) => run('meals', 'readonly', s => s.index('date').getAll(IDBKeyRange.bound(from, to))),
  allMeals: () => run('meals', 'readonly', s => s.getAll()),
  putMeal: m => run('meals', 'readwrite', s => s.put(m)),
  deleteMeal: id => run('meals', 'readwrite', s => s.delete(id)),

  // Rutinas
  allRoutines: () => run('routines', 'readonly', s => s.getAll()),
  putRoutine: r => run('routines', 'readwrite', s => s.put(r)),
  deleteRoutine: id => run('routines', 'readwrite', s => s.delete(id)),

  // Entrenos hechos en modo entrenar (series y pesos)
  allSessions: () => run('sessions', 'readonly', s => s.getAll()),
  putSession: x => run('sessions', 'readwrite', s => s.put(x)),
  deleteSession: id => run('sessions', 'readwrite', s => s.delete(id)),

  // Pesadas (peso y composición corporal)
  allWeights: () => run('weights', 'readonly', s => s.getAll()),
  putWeight: w => run('weights', 'readwrite', s => s.put(w)),
  putWeights: list => run('weights', 'readwrite', s => { list.forEach(w => s.put(w)); }),
  deleteWeight: date => run('weights', 'readwrite', s => s.delete(date)),

  // Borrar todo
  async clearAll() {
    await run('workouts', 'readwrite', s => s.clear());
    await run('meals', 'readwrite', s => s.clear());
    await run('routines', 'readwrite', s => s.clear());
    await run('sessions', 'readwrite', s => s.clear());
    await run('weights', 'readwrite', s => s.clear());
  },
};
