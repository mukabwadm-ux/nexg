import * as migration_20261105_154623_initial from './20261105_154623_initial';
import * as migration_20261119_090000_customer_reference from './20261119_090000_customer_reference';
import * as migration_20261127_115535_driver_locations from './20261127_115535_driver_locations';

export const migrations = [
  {
    up: migration_20261105_154623_initial.up,
    down: migration_20261105_154623_initial.down,
    name: '20261105_154623_initial',
  },
  {
    up: migration_20261119_090000_customer_reference.up,
    down: migration_20261119_090000_customer_reference.down,
    name: '20261119_090000_customer_reference',
  },
  {
    up: migration_20261127_115535_driver_locations.up,
    down: migration_20261127_115535_driver_locations.down,
    name: '20261127_115535_driver_locations'
  },
];
