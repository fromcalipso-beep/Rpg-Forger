import { AppLanguage } from '../types/rpg';

export interface TranslationStrings {
  appName: string;
  nav: {
    characters: string;
    sheet: string;
    inventory: string;
    equipment: string;
    abilities: string;
    notes: string;
    settings: string;
  };
  common: {
    save: string;
    cancel: string;
    delete: string;
    edit: string;
    duplicate: string;
    create: string;
    close: string;
    confirm: string;
    search: string;
    filter: string;
    all: string;
    none: string;
    add: string;
    remove: string;
    reset: string;
    export: string;
    import: string;
    yes: string;
    no: string;
    empty: string;
  };
}

export const STRINGS: Record<AppLanguage, TranslationStrings> = {
  'pt-BR': {
    appName: 'RPG Character Manager',
    nav: {
      characters: 'Personagens',
      sheet: 'Ficha',
      inventory: 'Inventário',
      equipment: 'Equipamento',
      abilities: 'Habilidades & Combate',
      notes: 'Diário',
      settings: 'Modelos & Ajustes',
    },
    common: {
      save: 'Salvar',
      cancel: 'Cancelar',
      delete: 'Excluir',
      edit: 'Editar',
      duplicate: 'Duplicar',
      create: 'Criar',
      close: 'Fechar',
      confirm: 'Confirmar',
      search: 'Buscar',
      filter: 'Filtrar',
      all: 'Todos',
      none: 'Nenhum',
      add: 'Adicionar',
      remove: 'Remover',
      reset: 'Reiniciar',
      export: 'Exportar',
      import: 'Importar',
      yes: 'Sim',
      no: 'Não',
      empty: 'Vazio',
    },
  },
  'en-US': {
    appName: 'RPG Character Manager',
    nav: {
      characters: 'Characters',
      sheet: 'Sheet',
      inventory: 'Inventory',
      equipment: 'Equipment',
      abilities: 'Abilities & Combat',
      notes: 'Journal',
      settings: 'Templates & Settings',
    },
    common: {
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      edit: 'Edit',
      duplicate: 'Duplicate',
      create: 'Create',
      close: 'Close',
      confirm: 'Confirm',
      search: 'Search',
      filter: 'Filter',
      all: 'All',
      none: 'None',
      add: 'Add',
      remove: 'Remove',
      reset: 'Reset',
      export: 'Export',
      import: 'Import',
      yes: 'Yes',
      no: 'No',
      empty: 'Empty',
    },
  },
};
