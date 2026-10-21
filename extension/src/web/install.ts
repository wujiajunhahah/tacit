// Evaluated before the background and content modules, so they see the stand-in APIs.
import { install } from './shim';

install();
