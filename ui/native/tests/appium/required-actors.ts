// Prints the number of devices the given tests need (max `actors` across the
// selection, see registry.requiredActorCount). The e2e pipeline calls this to
// decide how many simulators/emulators to boot. Usage:
//   ts-node required-actors.ts chat            -> 2
//   ts-node required-actors.ts onboarding      -> 1
//   ts-node required-actors.ts all             -> 2
import { requiredActorCount } from './registry'

process.stdout.write(String(requiredActorCount(process.argv.slice(2))))
