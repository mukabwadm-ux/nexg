import * as migration_20261116_143000_movies_occurrence from './20261116_143000_movies_occurrence';
import * as migration_20261105_154623_initial from './20261105_154623_initial';

export const migrations = [
  {
    up: migration_20261105_154623_initial.up,
    down: migration_20261105_154623_initial.down,
    name: '20261105_154623_initial'
  },
  {
    up: migration_20261116_143000_movies_occurrence.up,
    down: migration_20261116_143000_movies_occurrence.down,
    name: '20261116_143000_movies_occurrence',
  },
];
