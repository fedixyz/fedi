use std::collections::BTreeMap;

pub trait Translate<T> {
    fn translate(self) -> T;
}

pub trait NeedTranslation {}

impl<T: NeedTranslation> Translate<T> for T {
    fn translate(self) -> T {
        self
    }
}
impl<T1, T2, E1, E2> Translate<Result<T1, E1>> for Result<T2, E2>
where
    T2: Translate<T1>,
    E2: Translate<E1>,
{
    fn translate(self) -> Result<T1, E1> {
        self.map(Translate::translate).map_err(Translate::translate)
    }
}

impl<T1, T2: Translate<T1>> Translate<Option<T1>> for Option<T2> {
    fn translate(self) -> Option<T1> {
        self.map(Translate::translate)
    }
}

impl<T1, T2: Translate<T1>> Translate<Vec<T1>> for Vec<T2> {
    fn translate(self) -> Vec<T1> {
        self.into_iter().map(Translate::translate).collect()
    }
}

impl<T1, T2, U1, U2> Translate<(T1, U1)> for (T2, U2)
where
    T2: Translate<T1>,
    U2: Translate<U1>,
{
    fn translate(self) -> (T1, U1) {
        (self.0.translate(), self.1.translate())
    }
}

impl<K1, K2, V1, V2> Translate<BTreeMap<K1, V1>> for BTreeMap<K2, V2>
where
    K2: Translate<K1>,
    V2: Translate<V1>,
    K1: Ord,
{
    fn translate(self) -> BTreeMap<K1, V1> {
        self.into_iter().map(Translate::translate).collect()
    }
}

impl NeedTranslation for String {}
impl NeedTranslation for () {}
impl NeedTranslation for anyhow::Error {}
