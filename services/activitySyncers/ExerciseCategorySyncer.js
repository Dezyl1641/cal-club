const BaseCategorySyncer = require('./BaseCategorySyncer');
const { CATEGORY, ACTIVITY_TYPE } = require('../../utils/activityStoreConstants');

class ExerciseCategorySyncer extends BaseCategorySyncer {
  get category() {
    return CATEGORY.EXERCISE;
  }

  filter(data) {
    return data.filter((item) => item.activity_type != null && String(item.activity_type).toUpperCase() === ACTIVITY_TYPE.EXERCISE);
  }
}

module.exports = new ExerciseCategorySyncer();
