const mealFormatter = {
  formatMealResponse(meal) {
    // Determine meal type based on captured time in IST
    const capturedDate = new Date(meal.capturedAt);
    const istFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      hour12: false
    });
    const hour = parseInt(istFormatter.format(capturedDate));
    let mealType = 'Snack';
    if (hour >= 6 && hour < 11) mealType = 'Breakfast';
    else if (hour >= 11 && hour < 16) mealType = 'Lunch';
    else if (hour >= 16 && hour < 21) mealType = 'Dinner';
    else mealType = 'Snack';

    // Get the first image URL
    const imagePath = meal.photos && meal.photos.length > 0 ? meal.photos[0].url : '';

    // Calculate nutritional summary using final values if available, otherwise llm values
    const nutritionalSummary = {
      calories: parseFloat((meal.totalNutrition?.calories?.final || meal.totalNutrition?.calories?.llm || 0).toFixed(1)),
      protein: parseFloat((meal.totalNutrition?.protein?.final || meal.totalNutrition?.protein?.llm || 0).toFixed(1)),
      carbs: parseFloat((meal.totalNutrition?.carbs?.final || meal.totalNutrition?.carbs?.llm || 0).toFixed(1)),
      fats: parseFloat((meal.totalNutrition?.fat?.final || meal.totalNutrition?.fat?.llm || 0).toFixed(1))
    };

    // Format ingredients
    const ingredients = meal.items.map((item, index) => ({
      itemId: item.id,
      name: item.name?.final || item.name?.llm || 'Unknown Item',
      displayQuantity: {
        value: item.displayQuantity?.final?.value || item.displayQuantity?.llm?.value || 1,
        unit: item.displayQuantity?.final?.unit || item.displayQuantity?.llm?.unit || 'piece'
      },
      measureQuantity: {
        value: item.measureQuantity?.final?.value || item.measureQuantity?.llm?.value || null,
        unit: item.measureQuantity?.final?.unit || item.measureQuantity?.llm?.unit || 'g'
      },
      calories: parseFloat((item.nutrition?.calories?.final || item.nutrition?.calories?.llm || 0).toFixed(1)),
      protein: parseFloat((item.nutrition?.protein?.final || item.nutrition?.protein?.llm || 0).toFixed(1)),
      carbs: parseFloat((item.nutrition?.carbs?.final || item.nutrition?.carbs?.llm || 0).toFixed(1)),
      fats: parseFloat((item.nutrition?.fat?.final || item.nutrition?.fat?.llm || 0).toFixed(1))
    }));

    // Determine if meal is balanced (simple heuristic: protein > 20g, carbs > 30g, fats > 10g)
    const isBalanced = nutritionalSummary.protein >= 20 && nutritionalSummary.carbs >= 30 && nutritionalSummary.fats >= 10;
    const balanceMessage = isBalanced ? 'This is a well-balanced meal!' : 'Consider adding more variety to balance your meal.';

    return {
      success: true,
      mealId: meal._id.toString(),
      mealName: meal.name || 'Unknown Meal',
      mealType: mealType,
      imagePath: imagePath,
      isBalanced: isBalanced,
      balanceMessage: balanceMessage,
      nutritionalSummary: nutritionalSummary,
      ingredients: ingredients,
      timestamp: this.formatTimestampInIST(meal.capturedAt),
      version: "1.0.0"
    };
  },

  formatTimestampInIST(date) {
    // Format timestamp in IST timezone
    const d = new Date(date);
    
    // Format as ISO-like string but in IST: YYYY-MM-DDTHH:mm:ss+05:30
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).formatToParts(d);
    
    const year = parts.find(p => p.type === 'year').value;
    const month = parts.find(p => p.type === 'month').value;
    const day = parts.find(p => p.type === 'day').value;
    const hour = parts.find(p => p.type === 'hour').value;
    const minute = parts.find(p => p.type === 'minute').value;
    const second = parts.find(p => p.type === 'second').value;
    
    return `${year}-${month}-${day}T${hour}:${minute}:${second}+05:30`;
  }
};

module.exports = mealFormatter;
