import { getSettings } from '../../utils/settings'

export default defineEventHandler(async () => {
  return getSettings()
})
