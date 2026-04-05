export default class FDLockStub {
  constructor() {
    throw new Error('fd-lock is not available in browser runtime')
  }
}
