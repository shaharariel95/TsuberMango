<template>
  <div class="space-y-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
    <h3 class="text-xl font-bold text-gray-700 border-b pb-1">
      {{ emoji }} {{ title }}
    </h3>
    <div class="flex flex-col gap-2 max-h-80 overflow-y-auto p-1">
      <div v-for="(item, idx) in modelValue" :key="idx" class="flex gap-1">
        <input 
          :value="item" 
          @input="updateItem(idx, $event.target.value)" 
          class="flex-1 text-sm p-2 border rounded focus:border-emerald-500 outline-none"
        >
        <button @click="removeItem(idx)" class="text-red-400 hover:text-red-500 px-2 font-bold">✕</button>
      </div>
    </div>
    <button 
      @click="addItem" 
      class="w-full py-2 border-2 border-dashed border-gray-300 rounded text-gray-500 hover:border-emerald-300 hover:text-emerald-500 transition-all text-sm font-bold"
    >
      + הוסף {{ addButtonLabel }}
    </button>
  </div>
</template>

<script>
export default {
  props: ['title', 'emoji', 'modelValue', 'addButtonLabel'],
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const updateItem = (idx, val) => {
      const newList = [...props.modelValue];
      newList[idx] = val;
      emit('update:modelValue', newList);
    };
    const removeItem = (idx) => {
      const newList = props.modelValue.filter((_, i) => i !== idx);
      emit('update:modelValue', newList);
    };
    const addItem = () => {
      emit('update:modelValue', [...props.modelValue, ""]);
    };
    return { updateItem, removeItem, addItem };
  }
};
</script>
