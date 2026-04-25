<template>
  <div class="space-y-3 bg-slate-50 rounded-xl border border-slate-200 p-4">
    <h3 class="text-base font-bold text-slate-700 flex items-center gap-2 pb-2 border-b border-slate-200">
      <span>{{ emoji }}</span> {{ title }}
    </h3>
    <div class="flex flex-col gap-1.5 max-h-72 overflow-y-auto p-0.5">
      <div v-for="(item, idx) in modelValue" :key="idx" class="flex gap-1.5 group">
        <input 
          :value="item" 
          @input="updateItem(idx, $event.target.value)" 
          class="flex-1 text-sm p-2 bg-white border border-slate-200 rounded-lg
                 focus:border-mango-400 focus:ring-1 focus:ring-mango-400/50 outline-none
                 hover:border-slate-300 transition-colors"
        >
        <button @click="removeItem(idx)" 
                class="text-slate-300 hover:text-red-500 hover:bg-red-50 px-2 rounded-lg transition-all opacity-0 group-hover:opacity-100 font-bold text-sm">
          ✕
        </button>
      </div>
    </div>
    <button 
      @click="addItem" 
      class="w-full py-2 border-2 border-dashed border-slate-200 rounded-lg
             text-slate-400 hover:border-mango-300 hover:text-mango-500 hover:bg-mango-50/30
             transition-all text-sm font-medium"
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
