const BaseCategorySyncer = require('./BaseCategorySyncer');
const { CATEGORY, ACTIVITY_TYPE } = require('../../utils/activityStoreConstants');

const SUMMARY_TYPES = new Set([ACTIVITY_TYPE.STEPS, ACTIVITY_TYPE.CALORIES, ACTIVITY_TYPE.DISTANCE]);

class SummaryCategorySyncer extends BaseCategorySyncer {
  get category() {
    return CATEGORY.SUMMARY;
  }

  filter(data) {
    return data.filter((item) => item.activity_type != null && SUMMARY_TYPES.has(String(item.activity_type).toUpperCase()));
  }
}

module.exports = new SummaryCategorySyncer();
